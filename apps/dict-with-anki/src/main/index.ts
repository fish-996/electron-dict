import { app, BrowserWindow, shell, ipcMain, dialog, protocol } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import {
    dictionaryService,
    type LookupResult,
    type ResourceResult,
    type DictionaryGroup, // 导入新类型
    type DictionaryLoadConfig,
} from "./dictionaryService";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
import Store from "electron-store";
import fs from "fs/promises";
import path from "path";

// --- 新的存储结构和类型 ---
interface DictionaryResourceConfig {
    [resourcePath: string]: boolean; // key: 资源文件路径, value: 是否启用
}

export interface DictionaryConfig {
    enabled: boolean; // 整个词典组是否启用
    enabledResources: DictionaryResourceConfig;
    customName?: string;
}

interface AppStore {
    dictionaryScanPaths: string[];
    dictionaryConfigs: Record<string, DictionaryConfig>; // key: mdx 文件的路径 (作为 ID)
}

// 初始化持久化存储
const store = new Store<AppStore>({
    defaults: {
        dictionaryScanPaths: [],
        dictionaryConfigs: {},
    },
});

// --- 全局变量，用于缓存从 worker 获取的数据 ---
let discoveredGroups: DictionaryGroup[] = [];
let assetsContent: Record<string, string> = {};

// --- 异常处理 ---
process.on("uncaughtException", (error) => {
    console.error("--- [全局未捕获异常] ---");
    console.error("发生了一个致命错误，应用即将退出:", error);
    // 在生产环境中可以考虑弹窗提示用户
    app.exit(1);
});

// Register a custom scheme that is NOT part of the standard web schemes.
// This allows us to use it for arbitrary resources.
// The scheme should be registered before any protocol.handle calls.
// This is important for protocol.handle to work correctly with non-standard schemes.
protocol.registerSchemesAsPrivileged([
    {
        scheme: "mdx-asset",
        privileges: {
            standard: true,
            secure: true,
            bypassCSP: true,
            allowServiceWorkers: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
    {
        scheme: "sound",
        privileges: {
            standard: true,
            secure: true,
            bypassCSP: true,
            allowServiceWorkers: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

function registerProtocols() {
    // --- mdx-asset:// 协议处理 ---
    protocol.handle("mdx-asset", async (request) => {
        try {
            const url = new URL(request.url);
            const dictionaryId = url.searchParams.get("dictId");
            const assetKey = url.searchParams.get("key");

            if (!dictionaryId || !assetKey) {
                console.warn(
                    `Invalid mdx-asset URL (missing params): ${request.url}`,
                );
                return new Response(
                    "Bad Request: Missing dictId or key parameter",
                    { status: 400 },
                );
            }

            // dictionaryService 调用保持不变
            const resource = await dictionaryService.getResource(
                assetKey,
                dictionaryId,
            );

            if (resource && resource.data) {
                const buffer = Buffer.from(resource.data, "base64");
                return new Response(buffer, {
                    headers: {
                        "Content-Type":
                            resource.mimeType || "application/octet-stream",
                    },
                });
            } else {
                console.warn(`mdx-asset not found for ${request.url}`);
                return new Response("Not Found", { status: 404 });
            }
        } catch (error) {
            console.error(
                `Error handling mdx-asset request for ${request.url}:`,
                error,
            );
            return new Response("Internal Server Error", { status: 500 });
        }
    });

    // --- [修改] sound:// 协议处理器，解析查询参数 ---
    protocol.handle("sound", async (request) => {
        try {
            const url = new URL(request.url);
            const dictionaryId = url.searchParams.get("dictId");
            const soundKey = url.searchParams.get("key");

            if (!dictionaryId || !soundKey) {
                console.warn(
                    `Invalid sound URL (missing params): ${request.url}`,
                );
                return new Response(
                    "Bad Request: Missing dictId or key parameter",
                    { status: 400 },
                );
            }

            // dictionaryService 调用保持不变
            const resource = await dictionaryService.getResource(
                soundKey,
                dictionaryId,
            );

            if (resource && resource.data) {
                const buffer = Buffer.from(resource.data, "base64");
                return new Response(buffer, {
                    headers: {
                        "Content-Type": resource.mimeType || "audio/x-speex",
                    },
                });
            } else {
                console.warn(`Sound not found for ${request.url}`);
                return new Response("Not Found", { status: 404 });
            }
        } catch (error) {
            console.error(
                `Error handling sound request for ${request.url}:`,
                error,
            );
            return new Response("Internal Server Error", { status: 500 });
        }
    });
}

// --- 核心初始化和重载逻辑 ---
async function initializeAndLoadDictionaries() {
    try {
        console.log("[Main] Starting dictionary initialization...");
        const scanPaths = store.get("dictionaryScanPaths");

        // 1. 发现
        discoveredGroups = await dictionaryService.discover(scanPaths);

        // 2. 同步配置
        const currentConfigs = store.get("dictionaryConfigs");
        const newConfigs: Record<string, DictionaryConfig> = {};

        for (const group of discoveredGroups) {
            const existingConfig = currentConfigs[group.id];
            if (existingConfig) {
                // 如果已存在配置，直接使用，但要确保资源列表是最新的
                const updatedResources: DictionaryResourceConfig = {};
                group.resources.forEach((res) => {
                    // 如果是新发现的资源，默认为 true；否则使用旧值
                    updatedResources[res.path] =
                        existingConfig.enabledResources[res.path] ?? true;
                });
                newConfigs[group.id] = {
                    ...existingConfig,
                    enabledResources: updatedResources,
                };
            } else {
                // 如果是新发现的词典组，创建默认配置（全部启用）
                const defaultResources: DictionaryResourceConfig = {};
                group.resources.forEach(
                    (res) => (defaultResources[res.path] = true),
                );
                newConfigs[group.id] = {
                    enabled: true,
                    enabledResources: defaultResources,
                };
            }
        }
        store.set("dictionaryConfigs", newConfigs);

        // 3. 准备加载数据
        const configsToLoad: DictionaryLoadConfig[] = [];
        const assetPathsToGet: string[] = [];

        for (const group of discoveredGroups) {
            const config = newConfigs[group.id];
            if (config.enabled) {
                configsToLoad.push({
                    id: group.id,
                    mdxPath: group.mdxPath,
                    enabledMddPaths: group.resources
                        .filter(
                            (res) =>
                                res.type === "mdd" &&
                                config.enabledResources[res.path],
                        )
                        .map((res) => res.path),
                });

                group.resources
                    .filter(
                        (res) =>
                            (res.type === "css" || res.type === "js") &&
                            config.enabledResources[res.path],
                    )
                    .forEach((res) => assetPathsToGet.push(res.path));
            }
        }

        // 4. 加载
        await dictionaryService.load(configsToLoad);
        assetsContent = await dictionaryService.getAssets(assetPathsToGet);

        console.log(
            "[Main] Dictionary service initialization and loading complete.",
        );

        // 通知渲染进程配置已更新
        BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send("config-updated");
        });
    } catch (error) {
        console.error(
            "[Main] FATAL: Could not initialize or load dictionaries.",
            error,
        );
        // 可以在这里向用户显示一个错误对话框
        dialog.showErrorBox(
            "词典加载失败",
            "无法初始化词典服务，请检查词典文件和应用设置。错误信息: " +
                (error as Error).message,
        );
    }
}

function createWindow(): void {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "../preload/index.mjs"),
            sandbox: false, // 注意：在生产环境中，如果可能，应尽可能开启沙箱
        },
    });

    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
        if (is.dev) mainWindow.webContents.openDevTools();
    });

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
    });

    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }
}

app.whenReady().then(async () => {
    electronApp.setAppUserModelId("com.electron.app");

    app.on("browser-window-created", (_, window) => {
        optimizer.watchWindowShortcuts(window);
    });

    registerProtocols();

    // 启动时执行一次初始化和加载
    await initializeAndLoadDictionaries();

    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// --- IPC 监听器 ---

// 运行时查询 API
ipcMain.handle(
    "dict:lookup",
    (_event, word: string): Promise<LookupResult[]> =>
        dictionaryService.lookup(word),
);

ipcMain.handle(
    "dict:lookupInDict",
    (
        _event,
        word: string,
        dictionaryId: string,
    ): Promise<LookupResult | null> =>
        dictionaryService.lookupInDict(word, dictionaryId),
);

ipcMain.handle(
    "dict:getResource",
    (
        _event,
        { key, dictionaryId }: { key: string; dictionaryId: string },
    ): Promise<ResourceResult | null> =>
        dictionaryService.getResource(key, dictionaryId),
);
ipcMain.handle(
    "dict:getSuggestions",
    (_event, prefix: string): Promise<string[]> =>
        dictionaryService.getSuggestions(prefix),
);
ipcMain.handle(
    "dict:getAssociatedWords",
    (_event, phrase: string): Promise<KeyWordItem[]> =>
        dictionaryService.getAssociatedWords(phrase),
);
ipcMain.handle(
    "dict:getSpellingSuggestions",
    (_event, phrase: string, distance?: number): Promise<KeyWordItem[]> =>
        dictionaryService.getSpellingSuggestions(phrase, distance),
);
ipcMain.handle(
    "dict:fuzzySearch",
    (
        _event,
        word: string,
        fuzzy_size?: number,
        ed_gap?: number,
    ): Promise<FuzzyWord[]> =>
        dictionaryService.fuzzySearch(word, fuzzy_size, ed_gap),
);

// 获取用户脚本 (CSS/JS 内容)
ipcMain.handle("get-all-user-scripts", () => {
    // 直接返回内存中缓存的资源内容
    return assetsContent;
});

// --- 新的设置管理 IPC ---

ipcMain.handle("settings:get-full-config", () => {
    // 返回发现的词典组和用户配置，供渲染进程的设置页面使用
    return {
        discoveredGroups,
        configs: store.get("dictionaryConfigs"),
        scanPaths: store.get("dictionaryScanPaths"),
    };
});

ipcMain.handle("settings:add-scan-path", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return store.get("dictionaryScanPaths");

    const { filePaths } = await dialog.showOpenDialog(window, {
        title: "选择词典文件夹",
        properties: ["openDirectory"],
    });

    if (filePaths && filePaths.length > 0) {
        const currentPaths = store.get("dictionaryScanPaths");
        // 使用 Set 去重
        const newPaths = [...new Set([...currentPaths, ...filePaths])];
        store.set("dictionaryScanPaths", newPaths);
        await initializeAndLoadDictionaries(); // 重新扫描和加载
        return newPaths;
    }
    return store.get("dictionaryScanPaths");
});

ipcMain.handle(
    "settings:remove-scan-path",
    async (_event, pathToRemove: string) => {
        let currentPaths = store.get("dictionaryScanPaths");
        currentPaths = currentPaths.filter((p) => p !== pathToRemove);
        store.set("dictionaryScanPaths", currentPaths);
        await initializeAndLoadDictionaries(); // 重新扫描和加载
        return currentPaths;
    },
);

ipcMain.handle(
    "settings:update-config",
    async (_event, updatedConfigs: Record<string, DictionaryConfig>) => {
        store.set("dictionaryConfigs", updatedConfigs);
        await initializeAndLoadDictionaries(); // 配置已更改，重新加载
        return true;
    },
);

ipcMain.handle(
    "system:open-path-in-explorer",
    async (_, targetPath: string) => {
        // 将参数名改为 targetPath
        try {
            let pathToOpen = targetPath; // 默认打开目标路径

            // 尝试获取路径的状态，判断是文件还是目录
            const stats = await fs.stat(targetPath);

            if (stats.isFile()) {
                // 如果是文件，则打开其所在的目录
                pathToOpen = path.dirname(targetPath);
            }
            // 如果是目录，pathToOpen 保持不变 (targetPath)

            // 使用 shell.openPath 打开路径
            const result = await shell.openPath(pathToOpen);

            if (result) {
                // shell.openPath 返回空字符串表示成功，否则是错误信息
                console.error(`Failed to open path ${pathToOpen}: ${result}`);
                throw new Error(`Failed to open path: ${result}`);
            }
            console.log(`Opened path: ${pathToOpen}`);
        } catch (error) {
            // 捕获文件系统操作或 shell.openPath 的错误
            console.error(`Error opening path ${targetPath}:`, error);
            throw new Error(`Failed to open path: ${(error as Error).message}`);
        }
    },
);
