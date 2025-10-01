import { app, BrowserWindow, shell, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { dictionaryService } from "./dictionaryService";
import type { KeyWordItem, FuzzyWord } from "js-mdict";

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
        console.log("Initializing dictionary service...");
        await dictionaryService.init();
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
        (_event, word: string): Promise<string | null> =>
            dictionaryService.lookup(word),
    );
    ipcMain.handle("dict:getResource", (_event, resourceKey: string) =>
        dictionaryService.getResource(resourceKey),
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
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
