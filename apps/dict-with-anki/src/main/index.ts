import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import {
    dictionaryService,
    type LookupResult,
    type ResourceResult,
} from "./dictionaryService";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
import Store from "electron-store";

// 初始化持久化存储
const store = new Store({
    defaults: {
        dictionaryPaths: [], // 默认没有词典
    },
});

process.on("uncaughtException", (error) => {
    console.error("--- [全局未捕获异常] ---");
    console.error("发生了一个致命错误，应用即将退出:", error);
    app.exit(1);
});

function createWindow(): void {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "../preload/index.mjs"),
            sandbox: false,
        },
    });

    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
        if (is.dev) {
            mainWindow.webContents.openDevTools();
        }
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

    try {
        console.log("Initializing dictionary service with stored paths...");
        const storedPaths = store.get("dictionaryPaths") as string[];
        await dictionaryService.init(storedPaths);
        console.log("Dictionary service initialization complete.");
    } catch (error) {
        console.error("FATAL: Could not initialize dictionary service.", error);
    }

    createWindow();

    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // --- 设置 IPC 监听器 ---
    ipcMain.handle(
        "dict:lookup",
        (_event, word: string): Promise<LookupResult[]> =>
            dictionaryService.lookup(word),
    );

    ipcMain.handle(
        "dict:getResource",
        (
            _event,
            { key, dictionaryName }: { key: string; dictionaryName: string },
        ): Promise<ResourceResult | null> =>
            dictionaryService.getResource(key, dictionaryName),
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

    // --- 用于管理词典路径的 IPC 监听器 ---
    ipcMain.handle("settings:get-dictionary-paths", () => {
        return store.get("dictionaryPaths") as string[];
    });

    ipcMain.handle("settings:add-dictionaries", async (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) return store.get("dictionaryPaths");

        const { filePaths } = await dialog.showOpenDialog(window, {
            title: "选择词典文件",
            properties: ["openFile", "multiSelections"],
            filters: [{ name: "Mdict 词典", extensions: ["mdx"] }],
        });

        if (filePaths && filePaths.length > 0) {
            const currentPaths = store.get("dictionaryPaths") as string[];
            const newPaths = [...new Set([...currentPaths, ...filePaths])];
            store.set("dictionaryPaths", newPaths);
            await dictionaryService.reload(newPaths);
            return newPaths;
        }
        return store.get("dictionaryPaths");
    });

    ipcMain.handle(
        "settings:remove-dictionary",
        async (_event, pathToRemove: string) => {
            let currentPaths = store.get("dictionaryPaths") as string[];
            currentPaths = currentPaths.filter((p) => p !== pathToRemove);
            store.set("dictionaryPaths", currentPaths);
            await dictionaryService.reload(currentPaths);
            return currentPaths;
        },
    );
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
