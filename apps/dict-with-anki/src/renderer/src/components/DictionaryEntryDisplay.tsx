// src/components/DictionaryEntryDisplay.tsx
import React, { useState, useEffect, useCallback } from "react";
import type { RenderedDefinitionBlock } from "../App";
import SandboxedDefinitionBlock from "./SandboxedDefinitionBlock";
import { useAppContext } from "@renderer/AppContext";

// 定义从 Dict 服务返回的原始结果类型
interface RawDefinitionResult {
    dictionaryId: string;
    dictionaryName: string;
    definition: string | null;
}

interface DictionaryEntryDisplayProps {
    initialWord: string; // 用户最初想查的词 (针对这个词典)
    rawResult: RawDefinitionResult; // 这个词典的原始查询结果
    onContentResolved: (
        dictionaryId: string,
        block: RenderedDefinitionBlock | null,
    ) => void;
    onEntryLinkClick: (word: string) => void;
    isFirst: boolean;
    userScripts: Record<string, string>;
}

const MAX_REDIRECT_DEPTH = 5; // 防止无限循环或过深跳转

const DictionaryEntryDisplay: React.FC<DictionaryEntryDisplayProps> = ({
    initialWord,
    rawResult,
    onContentResolved,
    onEntryLinkClick,
    isFirst,
    userScripts,
}) => {
    const { config } = useAppContext();

    // 内部状态，用于处理重定向和加载
    const [currentWord, setCurrentWord] = useState(initialWord); // 当前正在查询的词
    const [displayContent, setDisplayContent] = useState<string | null>(null); // 最终显示的内容
    const [isLoading, setIsLoading] = useState(true); // 内部加载状态
    const [redirectHistory, setRedirectHistory] = useState<string[]>([]); // 重定向路径
    const [error, setError] = useState<string | null>(null);

    const fetchEntry = useCallback(
        async (wordToFetch: string, depth: number, history: string[]) => {
            if (depth > MAX_REDIRECT_DEPTH) {
                setError(
                    `Max redirect depth (${MAX_REDIRECT_DEPTH}) exceeded for '${initialWord}' in '${rawResult.dictionaryName}'. Last word: '${wordToFetch}'`,
                );
                setIsLoading(false);
                onContentResolved(rawResult.dictionaryId, {
                    id: rawResult.dictionaryId,
                    dictionaryName: rawResult.dictionaryName,
                    dictionaryId: rawResult.dictionaryId,
                    htmlContent: `<p style="color:red;">Error: ${error}</p>`,
                    isLoading: false,
                });
                return;
            }
            if (history.includes(wordToFetch)) {
                setError(
                    `Infinite redirect loop detected: ${history.join(" -> ")} -> ${wordToFetch} in '${rawResult.dictionaryName}'`,
                );
                setIsLoading(false);
                onContentResolved(rawResult.dictionaryId, {
                    id: rawResult.dictionaryId,
                    dictionaryName: rawResult.dictionaryName,
                    dictionaryId: rawResult.dictionaryId,
                    htmlContent: `<p style="color:red;">Error: ${error}</p>`,
                    isLoading: false,
                });
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                // 如果是第一次查询，直接使用 rawResult.definition
                // 否则，通过 Electron IPC 再次查询
                let content: string | null;
                if (depth === 0 && wordToFetch === initialWord) {
                    content = rawResult.definition;
                } else {
                    console.log(
                        `Fetching '${wordToFetch}' from '${rawResult.dictionaryName}'`,
                    );
                    content =
                        (
                            await window.electronAPI.lookupInDict(
                                wordToFetch,
                                rawResult.dictionaryId,
                            )
                        )?.definition ?? null;
                }

                if (content && content.startsWith("@@@LINK=")) {
                    const targetWord = content
                        .substring("@@@LINK=".length)
                        .trim();
                    const [cleanTargetWord, _] = targetWord.split("#"); // 考虑锚点

                    const newHistory = [...history, wordToFetch];
                    setRedirectHistory(newHistory);
                    setCurrentWord(cleanTargetWord); // 更新当前查询的词
                    // 递归调用，继续查询目标词
                    await fetchEntry(cleanTargetWord, depth + 1, newHistory);
                    // 注意：anchor 的处理将在 SandboxedDefinitionBlock 接收到最终内容后进行
                } else {
                    // 最终内容
                    setDisplayContent(content);
                    setIsLoading(false);

                    // 通知父组件内容已解析
                    onContentResolved(rawResult.dictionaryId, {
                        id: rawResult.dictionaryId,
                        dictionaryName: rawResult.dictionaryName,
                        dictionaryId: rawResult.dictionaryId,
                        htmlContent: content,
                        isLoading: false,
                    });
                }
            } catch (err) {
                console.error(
                    `Error fetching entry '${wordToFetch}' for '${rawResult.dictionaryName}':`,
                    err,
                );
                const errorMessage = `Failed to load entry for '${wordToFetch}' in '${rawResult.dictionaryName}'.`;
                setError(errorMessage);
                setIsLoading(false);
                onContentResolved(rawResult.dictionaryId, {
                    id: rawResult.dictionaryId,
                    dictionaryName: rawResult.dictionaryName,
                    dictionaryId: rawResult.dictionaryId,
                    htmlContent: `<p style="color:red;">Error: ${errorMessage}</p>`,
                    isLoading: false,
                });
            }
        },
        [
            initialWord,
            rawResult.dictionaryId,
            rawResult.dictionaryName,
            rawResult.definition,
            error,
            onContentResolved,
        ],
    ); // 依赖项要完整

    useEffect(() => {
        // 当 initialWord 或 rawResult 改变时，重置并重新查询
        setRedirectHistory([]);
        setDisplayContent(null);
        setCurrentWord(initialWord);
        setIsLoading(true); // 重置加载状态
        setError(null); // 重置错误状态
        fetchEntry(initialWord, 0, []);
    }, [initialWord, rawResult.dictionaryId, rawResult.definition, fetchEntry]);

    // 聚合当前词典的 CSS 和 JS
    const dictConfig = config?.configs[rawResult.dictionaryId];
    const enabledResources = dictConfig?.enabledResources || {};
    const customCss = Object.keys(enabledResources)
        .filter((path) => path.endsWith(".css") && enabledResources[path])
        .map((path) => userScripts[path] || "")
        .join("\n");

    const customJs = Object.keys(enabledResources)
        .filter((path) => path.endsWith(".js") && enabledResources[path])
        .map((path) => userScripts[path] || "")
        .join("\n");

    // 如果是系统消息，则不应用自定义脚本
    const isSystemBlock = rawResult.dictionaryId.startsWith("system-");

    if (isLoading) {
        return (
            <div className="dictionary-block" key={rawResult.dictionaryId}>
                <h3>{rawResult.dictionaryName}</h3>
                <div style={{ padding: "10px" }}>
                    <p>Loading '{currentWord}'...</p>
                    {redirectHistory.length > 0 && (
                        <p style={{ fontSize: "0.8em", color: "#888" }}>
                            Redirecting from: {redirectHistory.join(" -> ")}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dictionary-block" key={rawResult.dictionaryId}>
                <h3>{rawResult.dictionaryName}</h3>
                <div style={{ padding: "10px", color: "red" }}>
                    <p>Error: {error}</p>
                    {redirectHistory.length > 0 && (
                        <p style={{ fontSize: "0.8em", color: "#888" }}>
                            Attempted redirect path:{" "}
                            {redirectHistory.join(" -> ")}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (!displayContent) {
        // 词条不存在或内容为空
        return (
            <div className="dictionary-block" key={rawResult.dictionaryId}>
                <h3>{rawResult.dictionaryName}</h3>
                <div style={{ padding: "10px" }}>
                    <p>No content found for '{currentWord}'.</p>
                    {redirectHistory.length > 0 && (
                        <p style={{ fontSize: "0.8em", color: "#888" }}>
                            Redirected from: {redirectHistory.join(" -> ")}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <SandboxedDefinitionBlock
            key={rawResult.dictionaryId}
            block={{
                id: rawResult.dictionaryId,
                dictionaryName: rawResult.dictionaryName,
                dictionaryId: rawResult.dictionaryId,
                htmlContent: displayContent,
                isLoading: false,
            }}
            isFirst={isFirst}
            onEntryLinkClick={onEntryLinkClick}
            customCss={isSystemBlock ? "" : customCss} // 系统块不应用自定义样式
            customJs={isSystemBlock ? "" : customJs} // 系统块不应用自定义脚本
        />
    );
};

export default DictionaryEntryDisplay;
