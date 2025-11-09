import { parentPort } from "worker_threads";
import { MDX, MDD, KeyWordItem, FuzzyWord } from "js-mdict";
import * as path from "path";
import * as fs from "fs/promises";
import { convertSpxToWav } from "@dict/speex-wasm-decoder";

// 描述一个被发现的资源文件
export interface DictionaryResource {
    path: string; // 文件的绝对路径
    name: string; // 文件名
    type: "mdd" | "css" | "js";
}

// 描述一个词典组，以一个 .mdx 文件为核心
export interface DictionaryGroup {
    id: string; // 基于 mdx 路径的唯一 ID
    name: string; // 词典的基本名称，用于分组
    mdxPath: string; // .mdx 文件的路径
    resources: DictionaryResource[]; // 发现的所有关联资源
}

// 主进程发送给 worker 以加载特定词典的配置
export interface DictionaryLoadConfig {
    id: string; // 对应 DictionaryGroup 的 id
    mdxPath: string;
    enabledMddPaths: string[];
}

// 包装已加载的词典实例
interface LoadedDictionaryInstance {
    id: string; // 对应 DictionaryGroup 的 id
    name: string; // 词典文件名，用于日志和查找
    mdx: MDX;
    mdds: MDD[];
}

// 存储已加载到内存的词典实例
const loadedDictionaries: LoadedDictionaryInstance[] = [];

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
        | "fuzzy_search"
        | "load"
        | "getAssets";
    payload: any;
}

/**
 * 查找与 mdx 文件关联的所有资源 (.mdd, .css, .js)
 */
async function findAssociatedFiles(mdxPath: string): Promise<DictionaryGroup> {
    const dir = path.dirname(mdxPath);
    const baseName = path.basename(mdxPath, path.extname(mdxPath));
    const resources: DictionaryResource[] = [];

    try {
        const files = await fs.readdir(dir);
        for (const file of files) {
            const fileExt = path.extname(file).toLowerCase();
            const fileBaseName = path.basename(file, fileExt);

            // 匹配同名或 "主文件名.xxx" 形式的文件
            if (fileBaseName.startsWith(baseName)) {
                if (fileExt === ".mdd") {
                    resources.push({
                        path: path.join(dir, file),
                        name: file,
                        type: "mdd",
                    });
                } else if (fileExt === ".css") {
                    resources.push({
                        path: path.join(dir, file),
                        name: file,
                        type: "css",
                    });
                } else if (fileExt === ".js") {
                    resources.push({
                        path: path.join(dir, file),
                        name: file,
                        type: "js",
                    });
                }
            }
        }
    } catch (e) {
        console.error(
            `[Worker] Failed to read directory ${dir} for associated files:`,
            e,
        );
    }

    return {
        id: encodeURIComponent(mdxPath), // 使用 mdxPath 作为唯一标识符
        name: baseName,
        mdxPath: mdxPath,
        resources: resources,
    };
}

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

parentPort?.on("message", async (message: WorkerMessage) => {
    const { id, type, payload } = message;
    try {
        switch (type) {
            // 步骤1: 发现所有词典及其资源
            case "init": {
                const scanPaths: string[] = payload.scanPaths;
                const dictionaryGroups: DictionaryGroup[] = [];

                for (const dirPath of scanPaths) {
                    try {
                        const files = await fs.readdir(dirPath);
                        for (const file of files) {
                            if (file.toLowerCase().endsWith(".mdx")) {
                                const mdxPath = path.join(dirPath, file);
                                const group =
                                    await findAssociatedFiles(mdxPath);
                                dictionaryGroups.push(group);
                            }
                        }
                    } catch (e) {
                        console.error(
                            `[Worker] Failed to scan directory ${dirPath}:`,
                            e,
                        );
                    }
                }

                parentPort?.postMessage({
                    id,
                    type: "init-result",
                    payload: { dictionaryGroups },
                });
                break;
            }

            // 步骤3a: 根据用户配置加载词典实例
            case "load": {
                const configs: DictionaryLoadConfig[] = payload.configs;
                loadedDictionaries.length = 0; // 清空旧实例

                for (const config of configs) {
                    try {
                        console.log(
                            `[Worker] Loading dictionary: ${config.mdxPath}`,
                        );
                        const mdx = new MDX(config.mdxPath);
                        const mdds: MDD[] = [];

                        for (const mddPath of config.enabledMddPaths) {
                            try {
                                console.log(
                                    `[Worker] Loading enabled MDD: ${mddPath}`,
                                );
                                mdds.push(new MDD(mddPath));
                            } catch (e) {
                                console.error(
                                    `[Worker] Failed to load MDD file ${mddPath}:`,
                                    e,
                                );
                            }
                        }

                        loadedDictionaries.push({
                            id: config.id,
                            name: path.basename(config.mdxPath),
                            mdx,
                            mdds,
                        });
                    } catch (e) {
                        console.error(
                            `[Worker] Failed to load dictionary from config ${config.id}:`,
                            e,
                        );
                    }
                }

                console.log(
                    `[Worker] Successfully loaded ${loadedDictionaries.length} dictionaries into memory.`,
                );
                parentPort?.postMessage({
                    id,
                    type: "load-result",
                    payload: { success: true },
                });
                break;
            }

            // 步骤3b: 获取启用的 CSS/JS 文件内容
            case "getAssets": {
                const assetPaths: string[] = payload.assetPaths;
                const assetsContent: Record<string, string> = {};

                const readPromises = assetPaths.map(async (assetPath) => {
                    try {
                        const content = await fs.readFile(assetPath, "utf-8");
                        assetsContent[assetPath] = content;
                    } catch (e) {
                        console.error(
                            `[Worker] Failed to read asset file ${assetPath}:`,
                            e,
                        );
                        assetsContent[assetPath] =
                            `/* Error reading file: ${path.basename(assetPath)} */`;
                    }
                });

                await Promise.all(readPromises);

                parentPort?.postMessage({
                    id,
                    type: "assets-result",
                    payload: { assetsContent },
                });
                break;
            }

            case "lookup": {
                const results: {
                    dictionaryId: string; // 返回 ID 而不是 name，更精确
                    dictionaryName: string;
                    definition: string;
                }[] = [];
                for (const dict of loadedDictionaries) {
                    const result = dict.mdx.lookup(payload.word);
                    if (result?.definition) {
                        results.push({
                            dictionaryId: dict.id,
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
                const { key, dictionaryId } = payload; // 使用 ID 来定位词典
                if (!key || !dictionaryId) {
                    throw new Error(
                        "getResource requires both 'key' and 'dictionaryId'.",
                    );
                }
                console.log(payload);
                console.log(loadedDictionaries.map((c) => c.id));

                const targetDict = loadedDictionaries.find(
                    (d) => d.id === dictionaryId,
                );

                if (!targetDict) {
                    console.warn(
                        `[Worker] Resource request failed: Dictionary '${dictionaryId}' not found.`,
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
                        `[Worker] Resource '${key}' not found in dictionary '${dictionaryId}'.`,
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
                const maxResults = payload.maxResults || 10;
                for (const dict of loadedDictionaries) {
                    const results = dict.mdx
                        .prefix(payload.prefix)
                        .slice(0, maxResults);
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
                const maxResults = payload.maxResults || 10;
                for (const dict of loadedDictionaries) {
                    allItems.push(
                        ...dict.mdx
                            .associate(payload.phrase)
                            .slice(0, maxResults),
                    );
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
                const maxResults = payload.maxResults || 10;
                for (const dict of loadedDictionaries) {
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
                    payload: Array.from(allItems.values()).slice(0, maxResults),
                });
                break;
            }

            case "fuzzy_search": {
                const allItems: FuzzyWord[] = [];
                for (const dict of loadedDictionaries) {
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
