import React, { useState, useEffect, useCallback } from "react";
import { debounce } from "lodash-es";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
import styles from "./App.module.css";

// Create a single, persistent audio player instance outside the component
const audioPlayer = new Audio();

// --- Type Definitions ---
interface SearchResults {
    suggestions: string[];
    spelling: KeyWordItem[];
    fuzzy: FuzzyWord[];
    associated: KeyWordItem[];
}

// --- Main React Component ---
const App: React.FC = () => {
    // --- State Management ---

    // Input and search triggers
    const [inputValue, setInputValue] = useState("");
    const [wordToLookup, setWordToLookup] = useState("");

    // Loading and UI states
    const [isLoading, setIsLoading] = useState(false);
    const [_isAudioPlaying, setIsAudioPlaying] = useState(false);

    // Your robust two-variable system for handling definitions
    const [rawDefinition, setRawDefinition] = useState<string | null>(null);
    const [renderedDefinition, setRenderedDefinition] = useState<string | null>(
        null,
    );

    // State for sidebar search results
    const [results, setResults] = useState<SearchResults>({
        suggestions: [],
        spelling: [],
        fuzzy: [],
        associated: [],
    });

    // --- API Calls & Data Fetching ---

    // Fetches the main definition and triggers the processing flow
    const lookupWord = useCallback(async (word: string) => {
        if (!word) return;
        setIsLoading(true);
        setRenderedDefinition(null); // Clear previous content immediately

        try {
            const defHtml = await window.electronAPI.lookup(word);
            setRawDefinition(defHtml); // Set raw HTML to trigger the processing `useEffect`

            // Fetch associated words in parallel without blocking the main definition
            window.electronAPI
                .getAssociatedWords(word)
                .then((associatedWords) =>
                    setResults((prev) => ({
                        ...prev,
                        associated: associatedWords,
                    })),
                )
                .catch((err) =>
                    console.error("Failed to get associated words:", err),
                );
        } catch (error) {
            console.error(`Error looking up ${word}:`, error);
            setRenderedDefinition(
                `<div class="${styles.welcome}"><h2>'${word}' not found.</h2></div>`,
            );
            setIsLoading(false); // Stop loading on error
        }
    }, []);

    // Triggers the lookup whenever the target word changes
    useEffect(() => {
        if (wordToLookup) {
            lookupWord(wordToLookup);
        }
    }, [wordToLookup, lookupWord]);

    // Debounced function for fetching sidebar suggestions
    const debouncedSearch = useCallback(
        debounce(async (query: string) => {
            if (query.length < 2) {
                setResults({
                    suggestions: [],
                    spelling: [],
                    fuzzy: [],
                    associated: [],
                });
                return;
            }
            try {
                const [suggestions, spelling, fuzzy] = await Promise.all([
                    window.electronAPI.getSuggestions(query),
                    window.electronAPI.getSpellingSuggestions(query),
                    window.electronAPI.fuzzySearch(query),
                ]);
                // Preserve associated words from the main lookup
                setResults((prev) => ({
                    ...prev,
                    suggestions,
                    spelling,
                    fuzzy,
                }));
            } catch (error) {
                console.error("Error fetching search results:", error);
            }
        }, 300),
        [],
    );

    // --- Core Logic: Processing Raw HTML into Renderable HTML ---
    useEffect(() => {
        if (!rawDefinition) {
            return;
        }

        // Cancellation flag to prevent stale updates from previous renders
        let isCancelled = false;

        const processAndSetRenderedHtml = async () => {
            // 1. Create an off-screen, in-memory container
            const container = document.createElement("div");
            container.innerHTML = rawDefinition;

            // 2. Find all resource elements within the temporary container
            const resourceElements = container.querySelectorAll<HTMLElement>(
                'link[href$=".css"], img[src]',
            );

            const promises = Array.from(resourceElements).map(
                async (element) => {
                    const isLink = element.tagName.toLowerCase() === "link";
                    const key = element.getAttribute(isLink ? "href" : "src");

                    if (!key || key.startsWith("data:")) return;

                    try {
                        const resource =
                            await window.electronAPI.getResource(key);
                        if (resource) {
                            const { data, mimeType } = resource;
                            if (isLink) {
                                // Embed CSS directly as a <style> tag
                                const style = document.createElement("style");
                                style.textContent = atob(data);
                                element.parentNode?.replaceChild(
                                    style,
                                    element,
                                );
                            } else {
                                // Mutate image src to a data URL
                                (element as HTMLImageElement).src =
                                    `data:${mimeType};base64,${data}`;
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to load resource: ${key}`, error);
                    }
                },
            );

            // 3. Wait for all resources to be fetched and applied
            await Promise.all(promises);

            // 4. Before updating state, check if this operation was cancelled
            if (!isCancelled) {
                setRenderedDefinition(container.innerHTML);
                setIsLoading(false);
            }
        };

        processAndSetRenderedHtml();

        // Cleanup function: runs when `rawDefinition` changes again
        return () => {
            isCancelled = true;
        };
    }, [rawDefinition]);

    // --- Event Handlers ---

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setInputValue(value);
        debouncedSearch(value);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            setWordToLookup(inputValue);
        }
    };

    const handleItemClick = (word: string) => {
        setInputValue(word);
        setWordToLookup(word);
    };

    // Handles clicks inside the definition content (for audio and entry links)
    const handleContentClick = useCallback(
        async (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement;
            const link = target.closest("a");

            if (!link) return;

            const href = link.getAttribute("href");
            if (!href) return;

            // Prevent default browser action for all handled links
            event.preventDefault();

            if (href.startsWith("sound://")) {
                setIsAudioPlaying(true);
                try {
                    const resource = await window.electronAPI.getResource(href);
                    if (resource) {
                        audioPlayer.src = `data:${resource.mimeType};base64,${resource.data}`;
                        await audioPlayer.play();
                    } else {
                        console.warn(`Audio resource not found: ${href}`);
                        setIsAudioPlaying(false);
                    }
                } catch (error) {
                    console.error(`Error playing audio ${href}:`, error);
                    setIsAudioPlaying(false);
                }
            } else if (href.startsWith("entry://")) {
                const entryWord = href
                    .replace("entry://", "")
                    .replace(/\\/g, "/");
                setInputValue(entryWord);

                setWordToLookup(entryWord);
            }
        },
        [],
    );

    // Effect to manage audio player state
    useEffect(() => {
        const onEnded = () => setIsAudioPlaying(false);
        const onPlay = () => setIsAudioPlaying(true);
        const onPause = () => setIsAudioPlaying(false);

        audioPlayer.addEventListener("ended", onEnded);
        audioPlayer.addEventListener("play", onPlay);
        audioPlayer.addEventListener("pause", onPause);

        return () => {
            audioPlayer.removeEventListener("ended", onEnded);
            audioPlayer.removeEventListener("play", onPlay);
            audioPlayer.removeEventListener("pause", onPause);
        };
    }, []);

    // --- JSX Rendering ---
    return (
        <div className={styles.container}>
            <div className={styles.sidebar}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search a word..."
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                    />
                </div>
                <div className={styles.resultsContainer}>
                    {results.suggestions.length > 0 && (
                        <ResultList
                            title="Suggestions"
                            items={results.suggestions}
                            onItemClick={handleItemClick}
                        />
                    )}
                    {results.spelling.length > 0 && (
                        <ResultList
                            title="Spelling Suggestions"
                            items={results.spelling.map((item) => item.keyText)}
                            onItemClick={handleItemClick}
                        />
                    )}
                    {results.fuzzy.length > 0 && (
                        <ResultList
                            title="Fuzzy Search"
                            items={results.fuzzy.map(
                                (item) => `${item.keyText} (ed: ${item.ed})`,
                            )}
                            onItemClick={(key) =>
                                handleItemClick(key.split(" (ed:")[0])
                            }
                        />
                    )}
                    {results.associated.length > 0 && (
                        <ResultList
                            title="Associated Words"
                            items={results.associated.map(
                                (item) => item.keyText,
                            )}
                            onItemClick={handleItemClick}
                        />
                    )}
                </div>
            </div>
            <div className={styles.content}>
                {isLoading && (
                    <div className={styles.loader}>
                        <span>Loading...</span>
                    </div>
                )}

                {!isLoading && renderedDefinition && (
                    <div
                        className="mdict-definition"
                        onClick={handleContentClick}
                        dangerouslySetInnerHTML={{ __html: renderedDefinition }}
                    />
                )}

                {/* Show welcome message only at the start */}
                {!isLoading && !renderedDefinition && !wordToLookup && (
                    <div className={styles.welcome}>
                        <h1>Welcome to MDict Reader</h1>
                        <p>Start typing in the search box to find a word.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Helper Component for Lists ---
interface ResultListProps {
    title: string;
    items: string[];
    onItemClick: (item: string) => void;
}

const ResultList: React.FC<ResultListProps> = ({
    title,
    items,
    onItemClick,
}) => (
    <>
        <h4 className={styles.listTitle}>{title}</h4>
        <ul className={styles.list}>
            {items.map((item, index) => (
                <li
                    key={`${title}-${index}-${item}`}
                    className={styles.listItem}
                    onClick={() => onItemClick(item)}
                >
                    {item}
                </li>
            ))}
        </ul>
    </>
);

export default App;
