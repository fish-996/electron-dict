// dictionaryService.ts

import { Worker } from "worker_threads";
import type { KeyWordItem, FuzzyWord } from "js-mdict";

const DICTIONARY_PATH =
    "C:/Users/yhyfc/Documents/Dicts/De-De-Langenscheidt-Vokabeln2.mdx";

import workerPath from "./dictionaryWorker?modulePath";

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    // Store the timeout to clear it upon completion
    timeoutId: NodeJS.Timeout;
}

interface ResourceResult {
    data: string;
    mimeType: string;
}

class DictionaryService {
    private worker: Worker | null = null;
    private isReady = false;
    private requestCounter = 0;
    private pendingRequests = new Map<number, PendingRequest>();

    constructor() {
        console.log("[DictService] Service created.");
    }

    // --- 核心修改: 将 init 改为 async 函数，并简化逻辑 ---
    public async init(): Promise<boolean> {
        if (this.isReady) {
            console.log("[DictService] Already initialized.");
            return true;
        }

        console.log("[DictService] Initializing worker...");
        this.worker = new Worker(workerPath);

        // --- 核心修改: 立即注册唯一的、最终的事件处理器 ---
        this.worker.on("message", this.onMessage.bind(this));

        this.worker.on("error", (err) => {
            console.error(
                "[DictService] Worker encountered a fatal error:",
                err,
            );
            this.isReady = false;
            // Reject all pending requests on worker error
            this.pendingRequests.forEach((req) => {
                clearTimeout(req.timeoutId);
                req.reject(err);
            });
            this.pendingRequests.clear();
        });

        this.worker.on("exit", (code) => {
            this.isReady = false;
            if (code !== 0) {
                const exitError = new Error(
                    `Worker stopped with exit code ${code}`,
                );
                console.error(`[DictService]`, exitError);
                // Reject all pending requests on worker exit
                this.pendingRequests.forEach((req) => {
                    clearTimeout(req.timeoutId);
                    req.reject(exitError);
                });
                this.pendingRequests.clear();
            }
        });

        try {
            // --- 核心修改: 直接 await postMessage 的结果 ---
            // Use a long timeout specifically for initialization.
            const result = await this.postMessage<{ success: boolean }>(
                "init",
                { mdxPath: DICTIONARY_PATH },
                60000, // 60-second timeout for init
            );

            if (result.success) {
                this.isReady = true;
                console.log("[DictService] Worker initialized successfully.");
                return true;
            } else {
                throw new Error("Worker reported initialization failure.");
            }
        } catch (error) {
            console.error("[DictService] Initialization failed:", error);
            // Ensure worker is terminated on failure
            await this.worker?.terminate();
            this.worker = null;
            this.isReady = false;
            return false;
        }
    }

    // --- 核心修改: onMessage 现在处理所有类型的返回消息 ---
    private onMessage(message: {
        id: number;
        type: string;
        payload: any;
    }): void {
        const { id, type, payload } = message;
        const pending = this.pendingRequests.get(id);

        if (pending) {
            // Clear the timeout *before* resolving/rejecting
            clearTimeout(pending.timeoutId);

            if (type.endsWith("-result")) {
                pending.resolve(payload);
            } else if (type === "error") {
                pending.reject(
                    new Error(payload.error || "Unknown worker error"),
                );
            } else {
                // Should not happen with current worker implementation
                pending.reject(
                    new Error(`Received unknown message type: ${type}`),
                );
            }

            this.pendingRequests.delete(id);
        } else {
            console.warn(
                `[DictService] Received message for unknown request id: ${id}`,
            );
        }
    }

    // --- 核心修改: postMessage 现在接受一个可选的超时参数 ---
    private postMessage<T>(
        type: string,
        payload: unknown,
        timeoutMs = 10000, // Default to 10s for normal requests
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.worker) {
                return reject(new Error("Worker not initialized."));
            }

            const id = this.requestCounter++;

            const timeoutId = setTimeout(() => {
                // Important: Check if the request is still pending before rejecting
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id); // Clean up
                    reject(new Error(`Request timed out for type: ${type}`));
                }
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeoutId });
            this.worker.postMessage({ id, type, payload });
        });
    }

    // --- 以下方法无需修改，它们将自动受益于新的 postMessage ---

    public async lookup(word: string): Promise<string | null> {
        if (!this.isReady) return null;
        const result = await this.postMessage<{ definition: string } | null>(
            "lookup",
            { word },
        );
        return result ? result.definition : null;
    }

    public async getResource(key: string): Promise<ResourceResult | null> {
        if (!this.isReady) return null;
        // SPX conversion can be slow, might want a longer timeout here too
        return this.postMessage<ResourceResult | null>(
            "getResource",
            { key },
            20000,
        );
    }

    public async getSuggestions(prefix: string): Promise<string[]> {
        if (!this.isReady || !prefix) return [];
        return this.postMessage<string[]>("prefix", { prefix });
    }

    public async getAssociatedWords(phrase: string): Promise<KeyWordItem[]> {
        if (!this.isReady || !phrase) return [];
        return this.postMessage<KeyWordItem[]>("associate", { phrase });
    }

    public async getSpellingSuggestions(
        phrase: string,
        distance = 2,
    ): Promise<KeyWordItem[]> {
        if (!this.isReady || !phrase) return [];
        return this.postMessage<KeyWordItem[]>("suggest", { phrase, distance });
    }

    public async fuzzySearch(
        word: string,
        fuzzy_size = 10,
        ed_gap = 2,
    ): Promise<FuzzyWord[]> {
        if (!this.isReady || !word) return [];
        return this.postMessage<FuzzyWord[]>("fuzzy_search", {
            word,
            fuzzy_size,
            ed_gap,
        });
    }
}

export const dictionaryService = new DictionaryService();
