// src/components/ContentArea.tsx
import React from "react";
import type { RawDefinitionResult, RenderedDefinitionBlock } from "../App";
import styles from "./ContentArea.module.css";
import DictionaryEntryDisplay from "./DictionaryEntryDisplay"; // 导入新的组件

interface ContentAreaProps {
    initialWord: string; // 原始查询词
    rawDefinitionResults: RawDefinitionResult[]; // 从 App.tsx 接收的原始结果
    resolvedDefinitionBlocks: RenderedDefinitionBlock[]; // 从 App.tsx 接收的最终解析结果
    isLoading: boolean; // 全局加载状态
    onEntryLinkClick: (word: string) => void;
    userScripts: Record<string, string>;
    onBlockResolved: (
        dictionaryId: string,
        block: RenderedDefinitionBlock | null,
    ) => void; // 传递给 DictionaryEntryDisplay 的回调
}

const ContentArea: React.FC<ContentAreaProps> = ({
    initialWord,
    rawDefinitionResults,
    resolvedDefinitionBlocks,
    isLoading,
    onEntryLinkClick,
    userScripts,
    onBlockResolved,
}) => {
    const renderContent = () => {
        if (isLoading && rawDefinitionResults.length === 0) {
            // 只有在首次加载且没有原始结果时才显示全局加载指示器
            return (
                <div className={styles.loader}>
                    <span>Loading...</span>
                </div>
            );
        }

        if (rawDefinitionResults.length > 0) {
            // 如果过滤后没有结果
            if (rawDefinitionResults.length === 0 && !isLoading) {
                return (
                    <div className={styles.welcome}>
                        <h1>
                            No enabled dictionaries found for '{initialWord}'
                        </h1>
                        <p>Please check your dictionary settings.</p>
                    </div>
                );
            }

            return rawDefinitionResults.map((rawResult, index) => {
                // DictionaryEntryDisplay 会处理其内部的加载、重定向和错误状态
                return (
                    <DictionaryEntryDisplay
                        key={rawResult.dictionaryId}
                        initialWord={initialWord}
                        rawResult={rawResult}
                        onContentResolved={onBlockResolved}
                        onEntryLinkClick={onEntryLinkClick}
                        isFirst={index === 0}
                        userScripts={userScripts}
                    />
                );
            });
        }

        // 如果没有 initialWord 且没有加载，显示欢迎信息
        if (!initialWord && !isLoading) {
            return (
                <div className={styles.welcome}>
                    <h1>Welcome to MDict Reader</h1>
                    <p>Start typing in the search box to find a word.</p>
                    <p>Click the settings icon to add dictionaries.</p>
                </div>
            );
        }

        // "not found" 和错误信息现在由 App.tsx 直接通过 resolvedDefinitionBlocks 处理
        // 如果 resolvedDefinitionBlocks 中有系统消息，我们直接渲染它们
        const systemBlocks = resolvedDefinitionBlocks.filter((block) =>
            block.dictionaryId.startsWith("system-"),
        );
        if (systemBlocks.length > 0) {
            return systemBlocks.map((block, _) => (
                <div key={block.id} className="dictionary-block">
                    <h3>{block.dictionaryName}</h3>
                    <div
                        dangerouslySetInnerHTML={{
                            __html: block.htmlContent || "",
                        }}
                    />
                </div>
            ));
        }

        return null; // 默认不渲染任何东西
    };

    return <main className={styles.content}>{renderContent()}</main>;
};

export default ContentArea;
