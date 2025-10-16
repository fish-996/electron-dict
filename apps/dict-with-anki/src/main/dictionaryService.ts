import { Worker } from "worker_threads";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
import workerPath from "./dictionaryWorker?modulePath";

// 公开的接口类型，供主进程使用
export interface LookupResult {
    dictionaryName: string;
    definition: string;
}

export interface ResourceResult {
    data: string;
    mimeType: string;
}

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeoutId: NodeJS.Timeout;
}

class DictionaryService {
    private worker: Worker | null = null;
    private isReady = false;
    private requestCounter = 0;
    private pendingRequests = new Map<number, PendingRequest>();

    constructor() {
        console.log("[DictService] Service created.");
    }

    public async init(mdxPaths: string[]): Promise<boolean> {
        if (this.worker) {
            console.log(
                "[DictService] A worker already exists. Terminating it before re-initialization.",
            );
            await this.worker.terminate();
            this.worker = null;
            this.isReady = false;
            this.pendingRequests.forEach((req) => {
                clearTimeout(req.timeoutId);
                req.reject(new Error("Service is reloading."));
            });
            this.pendingRequests.clear();
        }

        if (!mdxPaths || mdxPaths.length === 0) {
            console.warn(
                "[DictService] Initialization skipped: No dictionary paths provided.",
            );
            this.isReady = false;
            return true; // 认为是“成功”的空初始化
        }

        console.log(
            `[DictService] Initializing worker with ${mdxPaths.length} dictionaries...`,
        );
        this.worker = new Worker(workerPath);

        this.worker.on("message", this.onMessage.bind(this));
        this.worker.on("error", (err) => {
            console.error(
                "[DictService] Worker encountered a fatal error:",
                err,
            );
            this.isReady = false;
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
                this.pendingRequests.forEach((req) => {
                    clearTimeout(req.timeoutId);
                    req.reject(exitError);
                });
                this.pendingRequests.clear();
            }
        });

        try {
            // 增加超时以应对多个大词典的加载
            const result = await this.postMessage<{ success: boolean }>(
                "init",
                { mdxPaths },
                120000,
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
            await this.worker?.terminate();
            this.worker = null;
            this.isReady = false;
            return false;
        }
    }

    public async reload(mdxPaths: string[]): Promise<boolean> {
        console.log("[DictService] Reloading dictionaries...");
        return this.init(mdxPaths);
    }

    private onMessage(message: {
        id: number;
        type: string;
        payload: any;
    }): void {
        const { id, type, payload } = message;
        const pending = this.pendingRequests.get(id);

        if (pending) {
            clearTimeout(pending.timeoutId);
            if (type.endsWith("-result")) {
                pending.resolve(payload);
            } else if (type === "error") {
                pending.reject(
                    new Error(payload.error || "Unknown worker error"),
                );
            } else {
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

    private postMessage<T>(
        type: string,
        payload: unknown,
        timeoutMs = 10000,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // ===== [ 修正点 ] =====
            // 只检查 worker 实例是否存在。isReady 标志由公共API方法负责检查。
            if (!this.worker) {
                return reject(new Error("Worker has not been created."));
            }
            // =======================

            const id = this.requestCounter++;
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timed out for type: ${type}`));
                }
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeoutId });
            this.worker.postMessage({ id, type, payload });
        });
    }

    public async lookup(word: string): Promise<LookupResult[]> {
        if (!this.isReady || !word) return [];
        return this.postMessage<LookupResult[]>("lookup", { word });
    }

    public async getResource(
        key: string,
        dictionaryName: string,
    ): Promise<ResourceResult | null> {
        if (!this.isReady) return null;
        // SPX转换可能较慢，使用更长的超时
        return this.postMessage<ResourceResult | null>(
            "getResource",
            { key, dictionaryName },
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
