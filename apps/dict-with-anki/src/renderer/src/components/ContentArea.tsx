// src/components/ContentArea.tsx
import React from "react";
import type { RenderedDefinitionBlock } from "../App";
import styles from "./ContentArea.module.css";
// 导入新的沙箱化组件
import SandboxedDefinitionBlock from "./SandboxedDefinitionBlock";
import { useAppContext } from "@renderer/AppContext";
interface ContentAreaProps {
    wordToLookup: string;
    definitionBlocks: RenderedDefinitionBlock[];
    isLoading: boolean;
    onSoundLinkClick: (key: string, dictionaryId: string) => void; // 参数变为 dictionaryId
    onEntryLinkClick: (word: string) => void;
    userScripts: Record<string, string>; // 接收 userScripts
}

const ContentArea: React.FC<ContentAreaProps> = ({
    wordToLookup,
    definitionBlocks,
    isLoading,
    onSoundLinkClick,
    onEntryLinkClick,
    userScripts,
}) => {
    // --- handleContentClick 逻辑现在被移除了 ---
    // 因为事件处理已经下放到 SandboxedDefinitionBlock 和其 iframe 内部了

    const { config } = useAppContext();

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className={styles.loader}>
                    <span>Loading...</span>
                </div>
            );
        }

        if (definitionBlocks.length > 0) {
            return definitionBlocks.map((block, index) => {
                // 如果是系统消息，则不应用自定义脚本
                if (block.dictionaryId.startsWith("system-")) {
                    // 假设你有一个非沙箱化的 DefinitionBlock 用于系统消息
                    // return <SimpleDefinitionBlock key={block.id} block={block} isFirst={index === 0} />;
                    // 或者在 SandboxedDefinitionBlock 中处理这种情况
                }

                // 找到当前词典的配置
                const dictConfig = config?.configs[block.dictionaryId];
                if (!dictConfig) return null; // 如果找不到配置，则不渲染

                // 聚合所有启用的 CSS 和 JS
                const enabledResources = dictConfig.enabledResources || {};
                const customCss = Object.keys(enabledResources)
                    .filter(
                        (path) =>
                            path.endsWith(".css") && enabledResources[path],
                    )
                    .map((path) => userScripts[path] || "")
                    .join("\n");

                const customJs = Object.keys(enabledResources)
                    .filter(
                        (path) =>
                            path.endsWith(".js") && enabledResources[path],
                    )
                    .map((path) => userScripts[path] || "")
                    .join("\n");

                return (
                    <SandboxedDefinitionBlock
                        key={block.id}
                        block={block}
                        isFirst={index === 0}
                        onSoundLinkClick={onSoundLinkClick}
                        onEntryLinkClick={onEntryLinkClick}
                        customCss={customCss}
                        customJs={customJs}
                    />
                );
            });
        }

        if (!wordToLookup) {
            return (
                <div className={styles.welcome}>
                    <h1>Welcome to MDict Reader</h1>
                    <p>Start typing in the search box to find a word.</p>
                    <p>Click the settings icon to add dictionaries.</p>
                </div>
            );
        }

        return null; // "not found" 案例由 definition block 处理
    };

    return (
        // onClick 事件处理器可以移除了
        <main className={styles.content}>{renderContent()}</main>
    );
};

export default ContentArea;
