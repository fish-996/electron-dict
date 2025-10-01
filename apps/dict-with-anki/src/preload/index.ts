import { contextBridge, ipcRenderer } from "electron";
import type { KeyWordItem, FuzzyWord } from "js-mdict";

export interface ElectronAPI {
    lookup: (word: string) => Promise<string | null>;
    getResource: (
        key: string,
    ) => Promise<{ data: string; mimeType: string } | null>;
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
}

const api: ElectronAPI = {
    lookup: (word) => ipcRenderer.invoke("dict:lookup", word),
    getResource: (key) => ipcRenderer.invoke("dict:getResource", key),
    getSuggestions: (prefix) =>
        ipcRenderer.invoke("dict:getSuggestions", prefix),
    getAssociatedWords: (phrase) =>
        ipcRenderer.invoke("dict:getAssociatedWords", phrase),
    getSpellingSuggestions: (phrase, distance) =>
        ipcRenderer.invoke("dict:getSpellingSuggestions", phrase, distance),
    fuzzySearch: (word, fuzzy_size, ed_gap) =>
        ipcRenderer.invoke("dict:fuzzySearch", word, fuzzy_size, ed_gap),
};

try {
    contextBridge.exposeInMainWorld("electronAPI", api);
} catch (error) {
    console.error(error);
}
