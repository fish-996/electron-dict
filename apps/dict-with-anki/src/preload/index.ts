import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { KeyWordItem, FuzzyWord } from "js-mdict";

// --- 定义暴露给渲染进程的完整 API ---

export interface LookupResult {
    dictionaryId: string; // 使用 ID
    dictionaryName: string;
    definition: string;
}

export interface ResourceResult {
    data: string; // base64 encoded data
    mimeType: string;
}

export interface DictionaryResource {
    path: string; // 文件的绝对路径
    name: string; // 文件名
    type: "mdd" | "css" | "js";
}

interface DictionaryResourceConfig {
    [resourcePath: string]: boolean; // key: 资源文件路径, value: 是否启用
}

export interface DictionaryConfig {
    enabled: boolean; // 整个词典组是否启用
    enabledResources: DictionaryResourceConfig;
    customName?: string;
}

export interface DictionaryGroup {
    id: string; // 基于 mdx 路径的唯一 ID
    name: string; // 词典的基本名称，用于分组
    mdxPath: string; // .mdx 文件的路径
    resources: DictionaryResource[]; // 发现的所有关联资源
}

export interface FullConfig {
    discoveredGroups: DictionaryGroup[];
    configs: Record<string, DictionaryConfig>;
    scanPaths: string[];
}

// --- AI Types ---

export interface AIProviderConfig {
    provider: "openai" | "anthropic" | "custom";
    apiKey: string;
    baseUrl?: string;
    model: string;
    enabled: boolean;
}

export interface CardGenerationRequest {
    word: string;
    dictionaryContents: Array<{
        dictionaryName: string;
        htmlContent: string;
    }>;
    targetLanguage?: string;
    nativeLanguage?: string;
}

export interface CardGenerationResult {
    front: string;
    back: string;
    notes?: string;
    exampleSentences?: string[];
    pronunciation?: string;
    partOfSpeech?: string;
}

export interface ElectronAPI {
    // --- 运行时查询 API ---
    lookup: (word: string) => Promise<LookupResult[]>;
    getResource: (params: {
        key: string;
        dictionaryId: string; // 参数从 dictionaryName 变为 dictionaryId
    }) => Promise<ResourceResult | null>;
    lookupInDict: (
        key: string,
        dictionaryId: string,
    ) => Promise<LookupResult | null>;
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

    // --- 用户脚本 API ---
    getAllUserScripts: () => Promise<Record<string, string>>;

    // --- 设置和配置管理 API ---
    getFullConfig: () => Promise<FullConfig>;
    addScanPath: () => Promise<string[]>;
    removeScanPath: (pathToRemove: string) => Promise<string[]>;
    updateConfig: (
        updatedConfigs: Record<string, DictionaryConfig>,
    ) => Promise<boolean>;

    // --- 事件监听 API ---
    onConfigUpdated: (callback: () => void) => () => void;
    openPathInExplorer: (path: string) => Promise<void>; // 新增方法

    // --- AI API ---
    aiGetConfig: () => Promise<AIProviderConfig>;
    aiUpdateConfig: (config: AIProviderConfig) => Promise<boolean>;
    aiGenerateCard: (
        request: CardGenerationRequest,
    ) => Promise<CardGenerationResult>;
    aiGenerateExamples: (word: string, count?: number) => Promise<string[]>;
    aiSummarizeCloze: (word: string, definition: string) => Promise<string>;
    aiExtractInfo: (htmlContent: string) => Promise<{
        definitions: string[];
        partOfSpeech?: string;
        pronunciation?: string;
    }>;
}

// --- 实现 API ---
const api: ElectronAPI = {
    // --- 运行时查询 ---
    lookup: (word) => ipcRenderer.invoke("dict:lookup", word),

    lookupInDict: (word, dictionaryId) =>
        ipcRenderer.invoke("dict:lookupInDict", word, dictionaryId),

    getResource: (params) => ipcRenderer.invoke("dict:getResource", params),

    getSuggestions: (prefix) =>
        ipcRenderer.invoke("dict:getSuggestions", prefix),

    getAssociatedWords: (phrase) =>
        ipcRenderer.invoke("dict:getAssociatedWords", phrase),

    getSpellingSuggestions: (phrase, distance) =>
        ipcRenderer.invoke("dict:getSpellingSuggestions", phrase, distance),

    fuzzySearch: (word, fuzzy_size, ed_gap) =>
        ipcRenderer.invoke("dict:fuzzySearch", word, fuzzy_size, ed_gap),

    // --- 用户脚本 ---
    getAllUserScripts: () => ipcRenderer.invoke("get-all-user-scripts"),

    // --- 设置管理 ---
    getFullConfig: () => ipcRenderer.invoke("settings:get-full-config"),

    addScanPath: () => ipcRenderer.invoke("settings:add-scan-path"),

    removeScanPath: (pathToRemove) =>
        ipcRenderer.invoke("settings:remove-scan-path", pathToRemove),

    updateConfig: (updatedConfigs) =>
        ipcRenderer.invoke("settings:update-config", updatedConfigs),

    // --- 事件监听 ---
    onConfigUpdated: (callback: () => void) => {
        const handler = (_event: IpcRendererEvent) => callback();
        ipcRenderer.on("config-updated", handler);

        // 返回一个清理函数，允许 React 组件在卸载时取消监听
        return () => {
            ipcRenderer.removeListener("config-updated", handler);
        };
    },
    openPathInExplorer: (path) =>
        ipcRenderer.invoke("system:open-path-in-explorer", path),

    // --- AI API ---
    aiGetConfig: () => ipcRenderer.invoke("ai:get-config"),

    aiUpdateConfig: (config) => ipcRenderer.invoke("ai:update-config", config),

    aiGenerateCard: (request) =>
        ipcRenderer.invoke("ai:generate-card", request),

    aiGenerateExamples: (word, count = 3) =>
        ipcRenderer.invoke("ai:generate-examples", word, count),

    aiSummarizeCloze: (word, definition) =>
        ipcRenderer.invoke("ai:summarize-cloze", word, definition),

    aiExtractInfo: (htmlContent) =>
        ipcRenderer.invoke("ai:extract-info", htmlContent),
};

// --- 安全地暴露 API 到渲染进程 ---
try {
    // 'electronAPI' 是我们在渲染进程中通过 window.electronAPI 访问的键
    contextBridge.exposeInMainWorld("electronAPI", api);
    console.log("Electron API exposed to the main world.");
} catch (error) {
    console.error("Failed to expose Electron API to the main world:", error);
}
