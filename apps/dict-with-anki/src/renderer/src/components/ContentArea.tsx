// src/components/ContentArea.tsx
import React, { useCallback } from "react";
import type { RenderedDefinitionBlock as BlockData } from "../App";
import styles from "./ContentArea.module.css";

interface DefinitionBlockProps {
    block: BlockData;
    isFirst: boolean;
}

// A smaller, focused component for rendering one definition
const DefinitionBlock: React.FC<DefinitionBlockProps> = ({
    block,
    isFirst,
}) => {
    const isSystemMessage =
        block.dictionaryName === "System" || block.dictionaryName === "Error";
    return (
        <div data-dictionary-name={block.dictionaryName}>
            {!isSystemMessage && (
                <h3
                    className={`${styles.definitionTitle} ${isFirst ? styles.firstTitle : ""}`}
                >
                    {block.dictionaryName}
                </h3>
            )}
            {block.isLoading && (
                <div className={styles.loader}>
                    <span>Loading definition...</span>
                </div>
            )}
            {block.htmlContent && (
                <div dangerouslySetInnerHTML={{ __html: block.htmlContent }} />
            )}
        </div>
    );
};

interface ContentAreaProps {
    wordToLookup: string;
    definitionBlocks: BlockData[];
    isLoading: boolean;
    onSoundLinkClick: (key: string, dictionaryName: string) => void;
    onEntryLinkClick: (word: string) => void;
}

const ContentArea: React.FC<ContentAreaProps> = ({
    wordToLookup,
    definitionBlocks,
    isLoading,
    onSoundLinkClick,
    onEntryLinkClick,
}) => {
    // --- Logic Local to the ContentArea ---
    const handleContentClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            const link = target.closest("a");
            if (!link) return;

            const href = link.getAttribute("href");
            if (!href) return;

            event.preventDefault();

            // Find the parent dictionary block to get its name
            const blockElement = target.closest<HTMLElement>(
                "[data-dictionary-name]",
            );
            const dictionaryName = blockElement?.dataset.dictionaryName;

            if (href.startsWith("sound://") && dictionaryName) {
                // Communicate UP to App that a sound should be played
                onSoundLinkClick(href, dictionaryName);
            } else if (href.startsWith("entry://")) {
                const entryWord = href
                    .replace("entry://", "")
                    .replace(/\\/g, "/");
                // Communicate UP to App that a new word should be looked up
                onEntryLinkClick(entryWord);
            }
        },
        [onSoundLinkClick, onEntryLinkClick],
    );

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className={styles.loader}>
                    <span>Loading...</span>
                </div>
            );
        }

        if (definitionBlocks.length > 0) {
            return definitionBlocks.map((block, index) => (
                <DefinitionBlock
                    key={block.id}
                    block={block}
                    isFirst={index === 0}
                />
            ));
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

        return null; // The "not found" case is handled by a definition block now
    };

    return (
        <main className={styles.content} onClick={handleContentClick}>
            {renderContent()}
        </main>
    );
};

export default ContentArea;
