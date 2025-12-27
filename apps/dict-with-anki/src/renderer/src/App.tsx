// src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "./App.module.css";

// 确保从正确的路径导入 AppContextProvider 和 useAppContext
import { AppContextProvider, useAppContext } from "./AppContext"; // 假设 AppContext 在 contexts 文件夹下
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ContentArea from "./components/ContentArea";
import SettingsModal from "./components/SettingsModal";
import AnkiCardModal, {
    type AnkiCardDraftContext,
} from "./components/AnkiCardModal";
import type { KeyWordItem } from "js-mdict";

// 新增：定义从 Dict 服务返回的原始结果类型
export interface RawDefinitionResult {
    dictionaryId: string;
    dictionaryName: string;
    definition: string | null;
}

// 类型定义可以移到共享的 types.ts 文件
export interface RenderedDefinitionBlock {
    id: string; // 现在是 dictionaryId
    dictionaryName: string;
    dictionaryId: string; // 保留 ID 以便查找资源
    htmlContent: string | null;
    isLoading: boolean;
    // 新增：可选的重定向信息，用于在 UI 中显示
    redirectInfo?: string;
    resolvedWord?: string; // 最终解析到的词
}

// 将原有的 App 组件重命名为 AppContent
const AppContent: React.FC = () => {
    // 从 AppContext 中获取 userScripts 和 config
    const { userScripts, config } = useAppContext();

    // --- 本地状态 ---
    const [wordToSearch, setWordToSearch] = useState(""); // 用户最初输入的词
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [isAnkiModalOpen, setIsAnkiModalOpen] = useState(false);
    const [ankiDraftContext, setAnkiDraftContext] =
        useState<AnkiCardDraftContext | null>(null);

    // 存储从 Electron IPC 获得的原始查询结果 (可能包含 @@@LINK=)
    const [rawDefinitionResults, setRawDefinitionResults] = useState<
        RawDefinitionResult[]
    >([]);
    // 存储所有 DictionaryEntryDisplay 处理后的最终结果
    const [resolvedDefinitionBlocks, setResolvedDefinitionBlocks] = useState<
        RenderedDefinitionBlock[]
    >([]);

    const [associatedWords, setAssociatedWords] = useState<KeyWordItem[]>([]);
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);

    // 用于跟踪每个字典块是否已完成解析
    const pendingResolutions = useRef(new Set<string>());

    // 当一个 DictionaryEntryDisplay 完成解析时调用
    const handleBlockResolved = useCallback(
        (dictionaryId: string, block: RenderedDefinitionBlock | null) => {
            setResolvedDefinitionBlocks((prevBlocks) => {
                const existingIndex = prevBlocks.findIndex(
                    (b) => b.dictionaryId === dictionaryId,
                );
                if (block) {
                    if (existingIndex !== -1) {
                        // 更新现有块
                        const newBlocks = [...prevBlocks];
                        newBlocks[existingIndex] = block;
                        return newBlocks;
                    } else {
                        // 添加新块 (理论上不应该发生，因为我们是更新，不是添加)
                        return [...prevBlocks, block];
                    }
                } else {
                    // 如果 block 为 null，表示该词典没有内容，可以考虑不添加到列表中或添加一个空块
                    if (existingIndex !== -1) {
                        return prevBlocks.filter(
                            (b) => b.dictionaryId !== dictionaryId,
                        );
                    }
                    return prevBlocks;
                }
            });
            pendingResolutions.current.delete(dictionaryId);

            // 如果所有块都已解析完毕，则设置全局加载为 false
            if (pendingResolutions.current.size === 0) {
                setIsGlobalLoading(false);
            }
        },
        [],
    );

    const lookupWord = useCallback(
        async (word: string) => {
            if (!word) return;
            setIsGlobalLoading(true);
            setRawDefinitionResults([]);
            setResolvedDefinitionBlocks([]); // 清空之前的解析结果
            setAssociatedWords([]);
            pendingResolutions.current.clear(); // 清空待处理的解析任务

            try {
                const rawResults = await window.electronAPI.lookup(word);

                if (rawResults.length === 0) {
                    setResolvedDefinitionBlocks([
                        {
                            id: "not-found",
                            dictionaryName: "System",
                            dictionaryId: "system-not-found",
                            htmlContent: `<h2>'${word}' not found.</h2>`,
                            isLoading: false,
                        },
                    ]);
                    setIsGlobalLoading(false);
                    return;
                }

                console.log(config?.configs);

                const rawResultsWithName = rawResults.map((result) => ({
                    ...result,
                    dictionaryName:
                        config?.configs[result.dictionaryId]?.customName ||
                        result.dictionaryName,
                }));

                setRawDefinitionResults(rawResultsWithName);
                console.log(rawResultsWithName);
                // 初始化 pendingResolutions
                rawResultsWithName.forEach((result) =>
                    pendingResolutions.current.add(result.dictionaryId),
                );
                // 如果没有实际的词典结果（比如都因为配置过滤掉了），则可能需要在这里设置 isLoading(false)
                if (rawResultsWithName.length === 0) {
                    setIsGlobalLoading(false);
                }

                // 异步获取关联词
                window.electronAPI
                    .getAssociatedWords(word)
                    .then(setAssociatedWords)
                    .catch((err) =>
                        console.error("Failed to get associated words:", err),
                    );
            } catch (error) {
                console.error(`Error looking up ${word}:`, error);
                setResolvedDefinitionBlocks([
                    {
                        id: "error",
                        dictionaryName: "Error",
                        dictionaryId: "system-error",
                        htmlContent: `<h2>An error occurred.</h2><p>${(error as Error).message}</p>`,
                        isLoading: false,
                    },
                ]);
                setIsGlobalLoading(false);
            }
        },
        [config], // lookupWord 依赖项为空，因为它只依赖于传入的 word
    );

    // Effect to trigger the main lookup when wordToSearch changes OR config changes
    useEffect(() => {
        const handler = setTimeout(() => {
            if (wordToSearch) {
                console.log(
                    "Triggering lookup due to word or config change:",
                    wordToSearch,
                );
                lookupWord(wordToSearch);
            } else {
                // 如果 wordToSearch 为空，清空所有显示
                setRawDefinitionResults([]);
                setResolvedDefinitionBlocks([]);
                setAssociatedWords([]);
                setIsGlobalLoading(false);
                pendingResolutions.current.clear();
            }
        }, 100); // 100ms debounce

        return () => clearTimeout(handler);
    }, [wordToSearch, lookupWord, config]); // <--- 关键修改：添加 config 作为依赖项

    const canCreateAnkiCard = Boolean(wordToSearch);

    const openAnkiModal = useCallback(() => {
        if (!wordToSearch) return;

        const blocks = resolvedDefinitionBlocks
            .filter((b) => !b.dictionaryId.startsWith("system-"))
            .filter((b) => Boolean(b.htmlContent))
            .map((b) => ({
                dictionaryId: b.dictionaryId,
                dictionaryName: b.dictionaryName,
                htmlContent: b.htmlContent as string,
            }));

        const snapshot: AnkiCardDraftContext = {
            searchWord: wordToSearch,
            blocks,
        };

        setAnkiDraftContext(snapshot);
        setIsAnkiModalOpen(true);
    }, [resolvedDefinitionBlocks, wordToSearch]);

    return (
        <div className={styles.appContainer}>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            {ankiDraftContext && (
                <AnkiCardModal
                    isOpen={isAnkiModalOpen}
                    onClose={() => setIsAnkiModalOpen(false)}
                    context={ankiDraftContext}
                />
            )}

            <Header
                onSettingsClick={() => setIsSettingsOpen(true)}
                onCreateAnkiCard={openAnkiModal}
                canCreateAnkiCard={canCreateAnkiCard}
            />

            <div className={styles.mainLayout}>
                <Sidebar
                    associatedWords={associatedWords}
                    onWordSelect={setWordToSearch}
                />
                <ContentArea
                    initialWord={wordToSearch} // 传递原始查询词
                    rawDefinitionResults={rawDefinitionResults} // 传递原始结果
                    resolvedDefinitionBlocks={resolvedDefinitionBlocks} // 传递最终结果
                    isLoading={isGlobalLoading}
                    onEntryLinkClick={setWordToSearch}
                    userScripts={userScripts}
                    onBlockResolved={handleBlockResolved} // 传递回调函数
                />
            </div>
        </div>
    );
};

// 新的 App 组件，用于包裹 AppContent，提供 AppContext
const App: React.FC = () => {
    return (
        <AppContextProvider>
            <AppContent />
        </AppContextProvider>
    );
};

export default App;
