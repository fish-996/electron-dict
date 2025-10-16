import { contextBridge, ipcRenderer } from "electron";
import type { KeyWordItem, FuzzyWord } from "js-mdict";

// --- 新增/修改接口定义 ---

// 从 dictionaryService.ts 引入的类型，这里为了独立性重新定义
export interface LookupResult {
    dictionaryName: string;
    definition: string;
}

export interface ResourceResult {
    data: string;
    mimeType: string;
}

// 定义暴露给渲染进程的完整 API
export interface ElectronAPI {
    // --- 词典查询相关 API ---
    lookup: (word: string) => Promise<LookupResult[]>;
    getResource: (params: {
        key: string;
        dictionaryName: string;
    }) => Promise<ResourceResult | null>;
    getSuggestions: (prefix: string) => Promise<string[]>;
    getAssociatedWords: (phrase: string) => Promise<KeyWordItem[]>;
    getSpellingSuggestions: (
        phrase: string,
        distance?: number,
    ) => Promise<KeyWordItem[]>;
    fuzzySearch: (
        word: string,
        fuzzy_size?: number,
        ed_gap?: number,
    ) => Promise<FuzzyWord[]>;

    // --- 新增：设置相关 API ---
    getDictionaryPaths: () => Promise<string[]>;
    addDictionaries: () => Promise<string[]>;
    removeDictionary: (pathToRemove: string) => Promise<string[]>;
}

// --- 实现 API ---
const api: ElectronAPI = {
    // --- 词典查询 ---
    lookup: (word) => ipcRenderer.invoke("dict:lookup", word),

    // getResource 现在传递一个对象
    getResource: (params) => ipcRenderer.invoke("dict:getResource", params),

    getSuggestions: (prefix) =>
        ipcRenderer.invoke("dict:getSuggestions", prefix),

    getAssociatedWords: (phrase) =>
        ipcRenderer.invoke("dict:getAssociatedWords", phrase),

    getSpellingSuggestions: (phrase, distance) =>
        ipcRenderer.invoke("dict:getSpellingSuggestions", phrase, distance),

    fuzzySearch: (word, fuzzy_size, ed_gap) => {
        // 注意：ipcRenderer.invoke 的第二个参数之后的所有参数都会被平铺传递。
        // 但为了清晰和与 handle 匹配，最好将它们打包成一个对象。
        // 在我们的 main.ts 中，handle 已经正确处理了这种情况。
        return ipcRenderer.invoke("dict:fuzzySearch", word, fuzzy_size, ed_gap);
    },

    // --- 新增：设置 ---
    getDictionaryPaths: () =>
        ipcRenderer.invoke("settings:get-dictionary-paths"),

    addDictionaries: () => ipcRenderer.invoke("settings:add-dictionaries"),

    removeDictionary: (pathToRemove) =>
        ipcRenderer.invoke("settings:remove-dictionary", pathToRemove),
};

// --- 暴露 API ---
try {
    contextBridge.exposeInMainWorld("electronAPI", api);
} catch (error) {
    console.error("Failed to expose Electron API to the main world:", error);
}
