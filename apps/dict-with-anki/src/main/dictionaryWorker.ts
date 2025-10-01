// dictionaryWorker.ts

import { parentPort } from "worker_threads";
import { MDX, MDD, KeyWordItem } from "js-mdict";
import * as path from "path";
import * as fs from "fs";
// --- 新增 ---
// 在 Worker 中引入转换函数
import { convertSpxToWav } from "@dict/speex-wasm-decoder";

type MdictLookupResult = { keyText: string; definition: string }; // definition is base64 string
interface WorkerMessage {
    id: number;
    type:
        | "init"
        | "lookup"
        | "getResource"
        | "prefix"
        | "associate"
        | "suggest"
        | "fuzzy_search";
    payload: any;
}

let mdx: MDX;
const mddInstances: MDD[] = [];

// --- 新增 ---
// 将 getMimeType 函数也移到 Worker 中，让 Worker 负责所有资源处理逻辑
function getMimeType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    switch (ext) {
        case ".css":
            return "text/css";
        case ".js":
            return "application/javascript";
        case ".png":
            return "image/png";
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".gif":
            return "image/gif";
        case ".spx":
            return "audio/ogg"; // 原始类型
        case ".mp3":
            return "audio/mpeg";
        default:
            return "application/octet-stream";
    }
}

function loadMddFiles(mdxPath: string): void {
    console.log("[Worker] Searching for associated MDD files...");
    const dir = path.dirname(mdxPath);
    const baseName = path.basename(mdxPath, path.extname(mdxPath));
    try {
        const files = fs.readdirSync(dir);
        files.forEach((file) => {
            if (
                file.startsWith(baseName) &&
                file.toLowerCase().endsWith(".mdd")
            ) {
                const mddPath = path.join(dir, file);
                try {
                    console.log(`[Worker] Loading MDD file: ${mddPath}`);
                    mddInstances.push(new MDD(mddPath));
                } catch (e) {
                    console.error(
                        `[Worker] Failed to load MDD file ${mddPath}:`,
                        e,
                    );
                }
            }
        });
        console.log(`[Worker] Loaded ${mddInstances.length} MDD instance(s).`);
    } catch (e) {
        console.error(`[Worker] Failed to read dictionary directory:`, e);
    }
}

// --- 修改 ---
// 使 on-message 处理器变为 async 以便使用 await
parentPort?.on("message", async (message: WorkerMessage) => {
    const { id, type, payload } = message;
    try {
        switch (type) {
            case "init":
                mdx = new MDX(payload.mdxPath);
                loadMddFiles(payload.mdxPath);
                parentPort?.postMessage({
                    id,
                    type: "init-result",
                    payload: { success: true },
                });
                break;

            // ... 其他 case 保持不变 ...
            case "lookup":
                parentPort?.postMessage({
                    id,
                    type: "lookup-result",
                    payload: mdx.lookup(payload.word),
                });
                break;

            // --- 核心修改在此 ---
            case "getResource": {
                let resource: MdictLookupResult | null = null;
                const resourceKey =
                    "\\" +
                    payload.key
                        .replace(/^(entry:\/\/|sound:\/\/)/, "")
                        .replace(/\//g, "\\");

                // 1. 在所有 mdd 实例中查找资源
                for (const mdd of mddInstances) {
                    const found = mdd.locate(resourceKey);
                    if (found?.definition) {
                        resource = found as MdictLookupResult;
                        break;
                    }
                }

                // 2. 如果找到了资源，进行处理
                if (resource) {
                    const isSpx =
                        path.extname(resource.keyText).toLowerCase() === ".spx";

                    // 3. 如果是 SPX 文件，就在 Worker 线程中进行转换
                    if (isSpx) {
                        // --- 优化点：为转换操作添加独立的 try...catch ---
                        try {
                            console.log(
                                `[Worker] Converting SPX resource: ${resource.keyText}`,
                            );
                            const spxInputBuffer = Buffer.from(
                                resource.definition,
                                "base64",
                            );

                            // 即使这里打印了警告，只要它不抛出异常，代码就会继续执行
                            const wavOutputBuffer =
                                await convertSpxToWav(spxInputBuffer);

                            // 转换成功（即使有警告）
                            parentPort?.postMessage({
                                id,
                                type: "resource-result",
                                payload: {
                                    data: wavOutputBuffer.toString("base64"),
                                    mimeType: "audio/wav",
                                },
                            });
                        } catch (conversionError) {
                            // 如果转换过程真的抛出了一个致命错误（而不仅仅是警告）
                            console.error(
                                `[Worker] FATAL: SPX to WAV conversion failed for ${resource.keyText}.`,
                                conversionError,
                            );
                            // 向主进程发送一个清晰的失败信号
                            parentPort?.postMessage({
                                id,
                                type: "resource-result",
                                payload: null,
                            });
                        }
                    } else {
                        // 4. 如果不是 SPX，直接返回原始数据和对应的 MIME 类型
                        parentPort?.postMessage({
                            id,
                            type: "resource-result",
                            payload: {
                                data: resource.definition,
                                mimeType: getMimeType(resource.keyText),
                            },
                        });
                    }
                } else {
                    // 5. 如果未找到资源，发送空结果
                    parentPort?.postMessage({
                        id,
                        type: "resource-result",
                        payload: null,
                    });
                }
                break;
            }

            // ... 其他 case 保持不变 ...
            case "prefix": {
                const results: KeyWordItem[] = mdx.prefix(payload.prefix);
                parentPort?.postMessage({
                    id,
                    type: "prefix-result",
                    payload: results.map((item) => item.keyText),
                });
                break;
            }
            case "associate":
                parentPort?.postMessage({
                    id,
                    type: "associate-result",
                    payload: mdx.associate(payload.phrase),
                });
                break;
            case "suggest":
                parentPort?.postMessage({
                    id,
                    type: "suggest-result",
                    payload: mdx.suggest(payload.phrase, payload.distance || 2),
                });
                break;
            case "fuzzy_search":
                parentPort?.postMessage({
                    id,
                    type: "fuzzy_search-result",
                    payload: mdx.fuzzy_search(
                        payload.word,
                        payload.fuzzy_size || 10,
                        payload.ed_gap || 2,
                    ),
                });
                break;
        }
    } catch (error) {
        parentPort?.postMessage({
            id,
            type: "error",
            payload: { error: (error as Error).message },
        });
    }
});
