import { Worker } from "worker_threads";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
// 从 Worker 文件导入共享的类型定义，确保类型安全
import type { DictionaryGroup, DictionaryLoadConfig } from "./dictionaryWorker";
import workerPath from "./dictionaryWorker?modulePath"; // Vite/Rollup specific import

// --- 公开的接口类型 ---

export interface LookupResult {
    dictionaryId: string; // 使用 ID
    dictionaryName: string;
    definition: string;
}

export interface ResourceResult {
    data: string; // base64 encoded data
    mimeType: string;
}

// 重新导出 worker 的类型，方便上层使用
export type { DictionaryGroup, DictionaryLoadConfig };

// --- 内部类型 ---

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeoutId: NodeJS.Timeout;
}

// --- 服务实现 ---

class DictionaryService {
    private worker: Worker | null = null;

    // 新的状态标志
    private isDiscovering = false;
    private isLoading = false;
    private isReady = false; // 只有在 load 完成后才为 true

    private requestCounter = 0;
    private pendingRequests = new Map<number, PendingRequest>();

    constructor() {
        console.log("[DictService] Service created.");
    }

    /**
     * 确保 Worker 实例存在并正在运行。如果不存在，则创建它。
     * 这是所有与 worker 交互的方法的私有前置步骤。
     */
    private ensureWorkerIsRunning(): void {
        if (this.worker) {
            return;
        }

        console.log("[DictService] Creating a new worker instance.");
        this.worker = new Worker(workerPath);

        this.worker.on("message", this.onMessage.bind(this));
        this.worker.on("error", this.onWorkerError.bind(this));
        this.worker.on("exit", this.onWorkerExit.bind(this));
    }

    /**
     * 优雅地终止当前 Worker，并清理所有待处理的请求。
     */
    public async shutdown(): Promise<void> {
        if (!this.worker) return;

        console.log("[DictService] Shutting down worker...");
        // 拒绝所有待处理的请求
        this.rejectAllPendingRequests(new Error("Service is shutting down."));

        await this.worker.terminate();
        this.worker = null;
        this.isDiscovering = false;
        this.isLoading = false;
        this.isReady = false;
    }

    // --- 新的公共 API ---

    /**
     * 步骤 1: 扫描指定目录以发现所有词典组。
     * @param scanPaths 要扫描的目录路径数组。
     * @returns 发现的词典组数组。
     */
    public async discover(scanPaths: string[]): Promise<DictionaryGroup[]> {
        if (this.isDiscovering || this.isLoading) {
            throw new Error("Service is busy discovering or loading.");
        }
        if (!scanPaths || scanPaths.length === 0) {
            console.warn(
                "[DictService] Discovery skipped: No scan paths provided.",
            );
            return [];
        }

        this.isDiscovering = true;
        this.isReady = false; // 发现阶段意味着旧的加载状态已失效
        this.ensureWorkerIsRunning();

        try {
            console.log(
                `[DictService] Discovering dictionaries in paths: ${scanPaths.join(", ")}`,
            );
            const result = await this.postMessage<{
                dictionaryGroups: DictionaryGroup[];
            }>(
                "init", // Worker 中的 "init" 现在是发现阶段
                { scanPaths },
                60000, // 发现文件通常很快
            );
            console.log(
                `[DictService] Discovered ${result.dictionaryGroups.length} dictionary groups.`,
            );
            return result.dictionaryGroups;
        } catch (error) {
            console.error("[DictService] Discovery failed:", error);
            await this.shutdown(); // 严重错误，关闭 worker
            throw error;
        } finally {
            this.isDiscovering = false;
        }
    }

    /**
     * 步骤 2: 根据用户配置，将词典加载到 Worker 内存中。
     * @param configs 要加载的词典配置数组。
     * @returns 加载是否成功。
     */
    public async load(configs: DictionaryLoadConfig[]): Promise<boolean> {
        if (this.isDiscovering || this.isLoading) {
            throw new Error("Service is busy discovering or loading.");
        }
        if (!configs || configs.length === 0) {
            console.warn(
                "[DictService] Loading skipped: No dictionary configs provided.",
            );
            this.isReady = false; // 没有加载任何词典，服务不是就绪状态
            // 如果存在 worker，需要清空它
            if (this.worker) await this.shutdown();
            return true;
        }

        this.isLoading = true;
        this.isReady = false;
        this.ensureWorkerIsRunning();

        try {
            console.log(
                `[DictService] Loading ${configs.length} dictionaries into memory...`,
            );
            const result = await this.postMessage<{ success: boolean }>(
                "load",
                { configs },
                180000, // 加载大词典可能需要很长时间
            );

            if (result.success) {
                this.isReady = true;
                console.log(
                    "[DictService] Dictionaries loaded successfully. Service is ready.",
                );
                return true;
            } else {
                throw new Error(
                    "Worker reported a failure during the loading process.",
                );
            }
        } catch (error) {
            console.error("[DictService] Loading failed:", error);
            await this.shutdown(); // 加载失败，关闭 worker
            throw error; // 向上层抛出错误
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 步骤 3: 获取用户启用的 CSS/JS 资源内容。
     * @param assetPaths CSS/JS 文件的绝对路径数组。
     * @returns 一个从路径到文件内容的映射对象。
     */
    public async getAssets(
        assetPaths: string[],
    ): Promise<Record<string, string>> {
        if (!assetPaths || assetPaths.length === 0) {
            return {};
        }
        this.ensureWorkerIsRunning();

        try {
            const result = await this.postMessage<{
                assetsContent: Record<string, string>;
            }>(
                "getAssets",
                { assetPaths },
                30000, // 读取文件通常很快
            );
            return result.assetsContent;
        } catch (error) {
            console.error("[DictService] Failed to get assets:", error);
            throw error;
        }
    }

    // --- 运行时查询 API (大部分保持不变，但更新了参数) ---

    public async lookup(word: string): Promise<LookupResult[]> {
        if (!this.isReady || !word) return [];

        return this.postMessage<LookupResult[]>("lookup", { word });
    }

    public async lookupInDict(
        word: string,
        dictionaryId: string,
    ): Promise<LookupResult | null> {
        if (!this.isReady || !word) return null;

        return this.postMessage<LookupResult | null>("lookupInDict", {
            word,
            dictionaryId,
        });
    }

    public async getResource(
        key: string,
        dictionaryId: string,
    ): Promise<ResourceResult | null> {
        if (!this.isReady) return null;
        return this.postMessage<ResourceResult | null>(
            "getResource",
            { key, dictionaryId }, // 使用 dictionaryId
            20000, // SPX 转换可能较慢
        );
    }

    public async getSuggestions(
        prefix: string,
        maxResults = 10,
    ): Promise<string[]> {
        if (!this.isReady || !prefix) return [];
        return this.postMessage<string[]>("prefix", { prefix, maxResults });
    }

    public async getAssociatedWords(
        phrase: string,
        maxResults = 10,
    ): Promise<KeyWordItem[]> {
        if (!this.isReady || !phrase) return [];
        return this.postMessage<KeyWordItem[]>("associate", {
            phrase,
            maxResults,
        });
    }

    public async getSpellingSuggestions(
        phrase: string,
        distance = 2,
        maxResults = 10,
    ): Promise<KeyWordItem[]> {
        if (!this.isReady || !phrase) return [];
        return this.postMessage<KeyWordItem[]>("suggest", {
            phrase,
            distance,
            maxResults,
        });
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

    // --- 私有辅助方法和事件处理器 ---

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
                const error = new Error(
                    payload.message || "Unknown worker error",
                );
                error.stack = payload.stack;
                pending.reject(error);
            } else {
                pending.reject(
                    new Error(`Received unexpected message type: ${type}`),
                );
            }
            this.pendingRequests.delete(id);
        } else {
            console.warn(
                `[DictService] Received message for unknown request id: ${id}`,
            );
        }
    }

    private onWorkerError(err: Error): void {
        console.error("[DictService] Worker encountered a fatal error:", err);
        this.isReady = this.isLoading = this.isDiscovering = false;
        this.rejectAllPendingRequests(err);
        this.worker = null; // Worker 已不可用
    }

    private onWorkerExit(code: number): void {
        this.isReady = this.isLoading = this.isDiscovering = false;
        if (code !== 0 && code !== 1) {
            // code 1 is normal termination
            const exitError = new Error(
                `Worker stopped unexpectedly with exit code ${code}`,
            );
            console.error(`[DictService]`, exitError);
            this.rejectAllPendingRequests(exitError);
        } else {
            console.log(
                `[DictService] Worker exited gracefully (code: ${code}).`,
            );
        }
        this.worker = null; // Worker 已不可用
    }

    private rejectAllPendingRequests(error: Error): void {
        this.pendingRequests.forEach((req) => {
            clearTimeout(req.timeoutId);
            req.reject(error);
        });
        this.pendingRequests.clear();
    }

    private postMessage<T>(
        type: string,
        payload: unknown,
        timeoutMs = 10000,
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.worker) {
                return reject(new Error("Worker is not running."));
            }

            const id = this.requestCounter++;
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(
                        new Error(
                            `Request timed out for type: ${type} after ${timeoutMs}ms`,
                        ),
                    );
                }
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeoutId });
            this.worker.postMessage({ id, type, payload });
        });
    }
}

export const dictionaryService = new DictionaryService();
