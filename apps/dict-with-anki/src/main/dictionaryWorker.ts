import { parentPort } from "worker_threads";
import { MDX, MDD, KeyWordItem, FuzzyWord } from "js-mdict";
import * as path from "path";
import * as fs from "fs";
import { convertSpxToWav } from "@dict/speex-wasm-decoder";

// 定义一个结构来包装每个词典实例及其关联的MDD文件
interface DictionaryInstance {
    name: string; // 词典文件名，用作唯一标识符
    mdx: MDX;
    mdds: MDD[];
}

// 结果类型定义
type MdictLookupResult = { keyText: string; definition: string };

// Worker 消息接口
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

// 将单个实例变量改为实例数组，用于管理所有加载的词典
const dictionaries: DictionaryInstance[] = [];

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

// 这个函数现在接收一个MDX路径，并为其加载所有关联的MDD文件
function loadMddFiles(mdxPath: string): MDD[] {
    const loadedMdds: MDD[] = [];
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
                    console.log(
                        `[Worker] Loading MDD file for ${baseName}: ${mddPath}`,
                    );
                    loadedMdds.push(new MDD(mddPath));
                } catch (e) {
                    console.error(
                        `[Worker] Failed to load MDD file ${mddPath}:`,
                        e,
                    );
                }
            }
        });
    } catch (e) {
        console.error(
            `[Worker] Failed to read dictionary directory for MDDs:`,
            e,
        );
    }
    return loadedMdds;
}

parentPort?.on("message", async (message: WorkerMessage) => {
    const { id, type, payload } = message;
    const mdxPaths: string[] = payload.mdxPaths;
    try {
        switch (type) {
            case "init":
                // 清空旧词典，为重载做准备
                dictionaries.length = 0;

                for (const mdxPath of mdxPaths) {
                    try {
                        console.log(
                            `[Worker] Initializing dictionary: ${mdxPath}`,
                        );
                        const mdx = new MDX(mdxPath);
                        const mdds = loadMddFiles(mdxPath);
                        dictionaries.push({
                            name: path.basename(mdxPath),
                            mdx,
                            mdds,
                        });
                    } catch (e) {
                        console.error(
                            `[Worker] Failed to load dictionary ${mdxPath}:`,
                            e,
                        );
                    }
                }
                console.log(
                    `[Worker] Successfully loaded ${dictionaries.length} of ${mdxPaths.length} dictionaries.`,
                );
                parentPort?.postMessage({
                    id,
                    type: "init-result",
                    payload: { success: true },
                });
                break;

            case "lookup": {
                const results: {
                    dictionaryName: string;
                    definition: string;
                }[] = [];
                for (const dict of dictionaries) {
                    const result = dict.mdx.lookup(payload.word);
                    if (result?.definition) {
                        results.push({
                            dictionaryName: dict.name,
                            definition: result.definition,
                        });
                    }
                }
                parentPort?.postMessage({
                    id,
                    type: "lookup-result",
                    payload: results,
                });
                break;
            }

            case "getResource": {
                const { key, dictionaryName } = payload;
                if (!key || !dictionaryName) {
                    throw new Error(
                        "getResource requires both 'key' and 'dictionaryName'.",
                    );
                }

                const targetDict = dictionaries.find(
                    (d) => d.name === dictionaryName,
                );

                if (!targetDict) {
                    console.warn(
                        `[Worker] Resource request failed: Dictionary '${dictionaryName}' not found.`,
                    );
                    parentPort?.postMessage({
                        id,
                        type: "resource-result",
                        payload: null,
                    });
                    break;
                }

                let resource: MdictLookupResult | null = null;
                const resourceKey =
                    "\\" +
                    key
                        .replace(/^(entry:\/\/|sound:\/\/)/, "")
                        .replace(/\//g, "\\");

                for (const mdd of targetDict.mdds) {
                    const found = mdd.locate(resourceKey);
                    if (found?.definition) {
                        resource = found as MdictLookupResult;
                        break;
                    }
                }

                if (resource) {
                    const isSpx =
                        path.extname(resource.keyText).toLowerCase() === ".spx";
                    if (isSpx) {
                        try {
                            console.log(
                                `[Worker] Converting SPX resource: ${resource.keyText}`,
                            );
                            const spxInputBuffer = Buffer.from(
                                resource.definition,
                                "base64",
                            );
                            const wavOutputBuffer =
                                await convertSpxToWav(spxInputBuffer);
                            parentPort?.postMessage({
                                id,
                                type: "resource-result",
                                payload: {
                                    data: wavOutputBuffer.toString("base64"),
                                    mimeType: "audio/wav",
                                },
                            });
                        } catch (conversionError) {
                            console.error(
                                `[Worker] FATAL: SPX to WAV conversion failed for ${resource.keyText}.`,
                                conversionError,
                            );
                            parentPort?.postMessage({
                                id,
                                type: "resource-result",
                                payload: null,
                            });
                        }
                    } else {
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
                    console.warn(
                        `[Worker] Resource '${key}' not found in dictionary '${dictionaryName}'.`,
                    );
                    parentPort?.postMessage({
                        id,
                        type: "resource-result",
                        payload: null,
                    });
                }
                break;
            }

            case "prefix": {
                const combined = new Set<string>();
                for (const dict of dictionaries) {
                    const results = dict.mdx.prefix(payload.prefix);
                    results.forEach((item) => combined.add(item.keyText));
                }
                parentPort?.postMessage({
                    id,
                    type: "prefix-result",
                    payload: Array.from(combined).sort(),
                });
                break;
            }

            case "associate": {
                const allItems: KeyWordItem[] = [];
                for (const dict of dictionaries) {
                    allItems.push(...dict.mdx.associate(payload.phrase));
                }
                // 在这里可以添加基于 keyText 的去重逻辑，如果需要的话
                parentPort?.postMessage({
                    id,
                    type: "associate-result",
                    payload: allItems,
                });
                break;
            }

            case "suggest": {
                const allItems = new Map<string, KeyWordItem>();
                for (const dict of dictionaries) {
                    const results = dict.mdx.suggest(
                        payload.phrase,
                        payload.distance || 2,
                    );
                    results.forEach((item) => {
                        if (!allItems.has(item.keyText)) {
                            allItems.set(item.keyText, item);
                        }
                    });
                }
                parentPort?.postMessage({
                    id: id,
                    type: "suggest-result",
                    payload: Array.from(allItems.values()),
                });
                break;
            }

            case "fuzzy_search": {
                const allItems: FuzzyWord[] = [];
                for (const dict of dictionaries) {
                    allItems.push(
                        ...dict.mdx.fuzzy_search(
                            payload.word,
                            payload.fuzzy_size || 10,
                            payload.ed_gap || 2,
                        ),
                    );
                }
                // 可以根据需要对结果进行排序或去重
                parentPort?.postMessage({
                    id,
                    type: "fuzzy_search-result",
                    payload: allItems,
                });
                break;
            }
        }
    } catch (error) {
        parentPort?.postMessage({
            id,
            type: "error",
            payload: { error: (error as Error).message },
        });
    }
});
