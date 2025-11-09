// src/App.tsx
import React, { useState, useEffect, useCallback } from "react";
import styles from "./App.module.css";

import { useAppContext } from "./AppContext"; // 使用我们的新 Context
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ContentArea from "./components/ContentArea";
import SettingsModal from "./components/SettingsModal";
import type { KeyWordItem } from "js-mdict";

// 类型定义可以移到共享的 types.ts 文件
export interface RenderedDefinitionBlock {
    id: string; // 现在是 dictionaryId
    dictionaryName: string;
    dictionaryId: string; // 保留 ID 以便查找资源
    htmlContent: string | null;
    isLoading: boolean;
}

// 单一、持久的音频播放器实例
const audioPlayer = new Audio();

const App: React.FC = () => {
    // --- 从 Context 获取全局状态 ---
    const { userScripts } = useAppContext();

    // --- 本地状态 ---
    const [wordToLookup, setWordToLookup] = useState("");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [definitionBlocks, setDefinitionBlocks] = useState<
        RenderedDefinitionBlock[]
    >([]);
    const [associatedWords, setAssociatedWords] = useState<KeyWordItem[]>([]);
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);
    const [_isAudioPlaying, setIsAudioPlaying] = useState(false);

    // --- 核心数据获取逻辑 ---
    // `processRawHtml` 函数已不再需要，因为资源处理现在由沙箱化的 iframe 和预加载的 CSS/JS 完成。

    const lookupWord = useCallback(async (word: string) => {
        if (!word) return;
        setIsGlobalLoading(true);
        setDefinitionBlocks([]);
        setAssociatedWords([]);

        try {
            const rawResults = await window.electronAPI.lookup(word);

            if (rawResults.length === 0) {
                setDefinitionBlocks([
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

            // 使用 dictionaryId 作为唯一的 key
            const initialBlocks = rawResults.map((result) => ({
                id: result.dictionaryId,
                dictionaryName: result.dictionaryName,
                dictionaryId: result.dictionaryId,
                htmlContent: result.definition, // 直接使用原始 HTML
                isLoading: false, // HTML 已包含，不再需要单独加载
            }));
            setDefinitionBlocks(initialBlocks);
            setIsGlobalLoading(false);

            // 异步获取关联词
            window.electronAPI
                .getAssociatedWords(word)
                .then(setAssociatedWords)
                .catch((err) =>
                    console.error("Failed to get associated words:", err),
                );
        } catch (error) {
            console.error(`Error looking up ${word}:`, error);
            setDefinitionBlocks([
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
    }, []);

    // Effect to trigger the main lookup when wordToLookup changes
    useEffect(() => {
        // 防抖动可以进一步优化，但现在保持简单
        const handler = setTimeout(() => {
            if (wordToLookup) {
                lookupWord(wordToLookup);
            }
        }, 100); // 轻微延迟以避免快速输入时的频繁请求

        return () => clearTimeout(handler);
    }, [wordToLookup, lookupWord]);

    // --- 全局音频播放器管理 ---
    const handlePlaySound = useCallback(
        async (key: string, dictionaryId: string) => {
            setIsAudioPlaying(true);
            try {
                console.log(dictionaryId);
                // 使用 dictionaryId 来获取资源
                const resource = await window.electronAPI.getResource({
                    key,
                    dictionaryId,
                });
                if (resource) {
                    audioPlayer.src = `data:${resource.mimeType};base64,${resource.data}`;
                    await audioPlayer.play();
                } else {
                    console.warn(
                        `Audio resource not found: ${key} in ${dictionaryId}`,
                    );
                    setIsAudioPlaying(false);
                }
            } catch (error) {
                console.error(`Error playing audio ${key}:`, error);
                setIsAudioPlaying(false);
            }
        },
        [],
    );

    useEffect(() => {
        const onEnded = () => setIsAudioPlaying(false);
        audioPlayer.addEventListener("ended", onEnded);
        return () => audioPlayer.removeEventListener("ended", onEnded);
    }, []);

    return (
        <div className={styles.appContainer}>
            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />

            <Header onSettingsClick={() => setIsSettingsOpen(true)} />

            <div className={styles.mainLayout}>
                <Sidebar
                    associatedWords={associatedWords}
                    onWordSelect={setWordToLookup}
                    initialWord={wordToLookup}
                />
                <ContentArea
                    wordToLookup={wordToLookup}
                    definitionBlocks={definitionBlocks}
                    isLoading={isGlobalLoading}
                    onEntryLinkClick={setWordToLookup}
                    onSoundLinkClick={handlePlaySound}
                    userScripts={userScripts} // 将获取到的脚本传递下去
                />
            </div>
        </div>
    );
};

export default App;
