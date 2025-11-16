// src/components/Sidebar.tsx
import React, { useState, useCallback, useEffect } from "react";
import { debounce } from "lodash-es";
import type { KeyWordItem, FuzzyWord } from "js-mdict";
import styles from "./Sidebar.module.css";

// Helper component can stay here or be moved to its own file
const ResultList: React.FC<{
    title: string;
    items: string[];
    onItemClick: (item: string) => void;
}> = ({ title, items, onItemClick }) => (
    <>
        <h4 className={styles.listTitle}>{title}</h4>
        <ul className={styles.list}>
            {items.map((item, index) => (
                <li
                    key={`${title}-${index}-${item}`}
                    className={styles.listItem}
                    onClick={() => onItemClick(item.split(" (ed:")[0])}
                >
                    {item}
                </li>
            ))}
        </ul>
    </>
);

interface SearchResults {
    suggestions: string[];
    spelling: KeyWordItem[];
    fuzzy: FuzzyWord[];
}

interface SidebarProps {
    associatedWords: KeyWordItem[];
    onWordSelect: (word: string) => void;
    initialWord?: string;
}

const Sidebar: React.FC<SidebarProps> = ({
    associatedWords,
    onWordSelect,
    initialWord,
}) => {
    // --- State Local to the Sidebar ---
    const [inputValue, setInputValue] = useState("");
    const [results, setResults] = useState<SearchResults>({
        suggestions: [],
        spelling: [],
        fuzzy: [],
    });

    useEffect(() => {
        setInputValue(initialWord ?? "");
    }, [initialWord]);

    // --- Logic Local to the Sidebar ---
    const debouncedSearch = useCallback(
        debounce(async (query: string) => {
            if (query.length < 2) {
                setResults({ suggestions: [], spelling: [], fuzzy: [] });
                return;
            }
            try {
                const [suggestions, spelling, fuzzy] = await Promise.all([
                    window.electronAPI.getSuggestions(query),
                    window.electronAPI.getSpellingSuggestions(query, 1),
                    window.electronAPI.fuzzySearch(query, 4, 2),
                ]);
                setResults({ suggestions, spelling, fuzzy });
            } catch (error) {
                console.error("Error fetching search results:", error);
            }
        }, 300),
        [],
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setInputValue(value);
        debouncedSearch(value);
    };

    const handleItemClick = (word: string) => {
        setInputValue(word);
        onWordSelect(word); // Communicate the selected word UP to App
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && inputValue) {
            onWordSelect(inputValue); // Communicate the selected word UP to App
        }
    };

    return (
        <aside className={styles.sidebar}>
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
                        onItemClick={handleItemClick}
                    />
                )}
                {/* Associated words are passed down from App */}
                {associatedWords.length > 0 && (
                    <ResultList
                        title="Associated Words"
                        items={associatedWords.map((item) => item.keyText)}
                        onItemClick={handleItemClick}
                    />
                )}
            </div>
        </aside>
    );
};

export default Sidebar;
