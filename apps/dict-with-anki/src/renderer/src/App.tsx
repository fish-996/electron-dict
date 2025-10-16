// src/App.tsx
import React, { useState, useEffect, useCallback } from "react";
import styles from "./App.module.css";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ContentArea from "./components/ContentArea";
import SettingsModal from "./components/SettingsModal";
import type { KeyWordItem } from "js-mdict";

// Types can be moved to a separate `types.ts` file
export interface RenderedDefinitionBlock {
    id: string;
    dictionaryName: string;
    htmlContent: string | null;
    isLoading: boolean;
}

// A single, persistent audio player instance
const audioPlayer = new Audio();

const App: React.FC = () => {
    // --- Shared/Global State ---
    const [wordToLookup, setWordToLookup] = useState("");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [definitionBlocks, setDefinitionBlocks] = useState<
        RenderedDefinitionBlock[]
    >([]);
    const [associatedWords, setAssociatedWords] = useState<KeyWordItem[]>([]);
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);
    const [_isAudioPlaying, setIsAudioPlaying] = useState(false);

    // --- Core Data Fetching Logic (Remains in App) ---
    const processRawHtml = useCallback(
        async (rawHtml: string, dictionaryName: string): Promise<string> => {
            // This logic is unchanged, it's a pure utility for the lookup process
            const container = document.createElement("div");
            container.innerHTML = rawHtml;
            const resourceElements = container.querySelectorAll<HTMLElement>(
                'link[href$=".css"], img[src]',
            );
            const promises = Array.from(resourceElements).map(
                async (element) => {
                    const isLink = element.tagName.toLowerCase() === "link";
                    const originalKey = element.getAttribute(
                        isLink ? "href" : "src",
                    );
                    if (!originalKey || originalKey.startsWith("data:")) return;
                    const key = originalKey.split("/").pop() || originalKey;
                    try {
                        const resource = await window.electronAPI.getResource({
                            key,
                            dictionaryName,
                        });
                        if (resource) {
                            const { data, mimeType } = resource;
                            if (isLink) {
                                const style = document.createElement("style");
                                style.textContent = atob(data);
                                element.parentNode?.replaceChild(
                                    style,
                                    element,
                                );
                            } else {
                                (element as HTMLImageElement).src =
                                    `data:${mimeType};base64,${data}`;
                            }
                        }
                    } catch (error) {
                        console.error(
                            `Failed to load resource: ${key} from ${dictionaryName}`,
                            error,
                        );
                    }
                },
            );
            await Promise.all(promises);
            return container.innerHTML;
        },
        [],
    );

    const lookupWord = useCallback(
        async (word: string) => {
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
                            htmlContent: `<h2>'${word}' not found.</h2>`,
                            isLoading: false,
                        },
                    ]);
                    setIsGlobalLoading(false);
                    return;
                }

                const initialBlocks = rawResults.map((result) => ({
                    id: result.dictionaryName,
                    dictionaryName: result.dictionaryName,
                    htmlContent: null,
                    isLoading: true,
                }));
                setDefinitionBlocks(initialBlocks);
                setIsGlobalLoading(false);

                // Fetch associated words
                window.electronAPI
                    .getAssociatedWords(word)
                    .then(setAssociatedWords)
                    .catch((err) =>
                        console.error("Failed to get associated words:", err),
                    );

                // Process HTML for each definition
                rawResults.forEach(async (rawResult) => {
                    const processedHtml = await processRawHtml(
                        rawResult.definition,
                        rawResult.dictionaryName,
                    );
                    setDefinitionBlocks((prevBlocks) =>
                        prevBlocks.map((block) =>
                            block.id === rawResult.dictionaryName
                                ? {
                                      ...block,
                                      htmlContent: processedHtml,
                                      isLoading: false,
                                  }
                                : block,
                        ),
                    );
                });
            } catch (error) {
                console.error(`Error looking up ${word}:`, error);
                setDefinitionBlocks([
                    {
                        id: "error",
                        dictionaryName: "Error",
                        htmlContent: `<h2>An error occurred.</h2><p>${(error as Error).message}</p>`,
                        isLoading: false,
                    },
                ]);
                setIsGlobalLoading(false);
            }
        },
        [processRawHtml],
    );

    // Effect to trigger the main lookup when wordToLookup changes
    useEffect(() => {
        if (wordToLookup) {
            lookupWord(wordToLookup);
        }
    }, [wordToLookup, lookupWord]);

    // --- Global Audio Player Management ---
    const handlePlaySound = async (key: string, dictionaryName: string) => {
        setIsAudioPlaying(true);
        try {
            const resource = await window.electronAPI.getResource({
                key,
                dictionaryName,
            });
            if (resource) {
                audioPlayer.src = `data:${resource.mimeType};base64,${resource.data}`;
                await audioPlayer.play();
            } else {
                console.warn(
                    `Audio resource not found: ${key} in ${dictionaryName}`,
                );
                setIsAudioPlaying(false);
            }
        } catch (error) {
            console.error(`Error playing audio ${key}:`, error);
            setIsAudioPlaying(false);
        }
    };

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
                    onWordSelect={setWordToLookup} // Pass the setter function directly
                    initialWord={wordToLookup}
                />
                <ContentArea
                    wordToLookup={wordToLookup}
                    definitionBlocks={definitionBlocks}
                    isLoading={isGlobalLoading}
                    onEntryLinkClick={setWordToLookup} // Re-use the same setter
                    onSoundLinkClick={handlePlaySound}
                />
            </div>
        </div>
    );
};

export default App;
