import React, { useMemo, useState, useCallback } from "react";
import styles from "./AnkiCardModal.module.css";
import SandboxedDefinitionBlock from "./SandboxedDefinitionBlock";
import { type RenderedDefinitionBlock } from "../App";
import { useAppContext } from "../AppContext";

export type CardSourceDictionaryBlock = {
    dictionaryId: string;
    dictionaryName: string;
    htmlContent: string;
    // audioCandidates?: Array<{ label: string; key: string }>; // TODO
};

export type AnkiCardDraftContext = {
    searchWord: string;
    blocks: CardSourceDictionaryBlock[];
};

type FieldType = "text" | "audio";

type AnkiFieldSpec = {
    name: string;
    type: FieldType;
    multiline?: boolean;
};

const FIELD_SPECS: AnkiFieldSpec[] = [
    { name: "Front", type: "text", multiline: false },
    { name: "Back", type: "text", multiline: true },
    { name: "Audio", type: "audio" },
];

interface AnkiCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    context: AnkiCardDraftContext;
}

const AnkiCardModal: React.FC<AnkiCardModalProps> = ({
    isOpen,
    onClose,
    context,
}) => {
    const { config, userScripts } = useAppContext();

    const initialFieldValues = useMemo(() => {
        // Per requirements: default empty, user chooses a dictionary as starting value.
        const values: Record<string, string> = {};
        for (const spec of FIELD_SPECS) {
            if (spec.type === "text") values[spec.name] = "";
        }
        return values;
    }, []);

    const [fieldValues, setFieldValues] =
        useState<Record<string, string>>(initialFieldValues);

    const [lastSelection, setLastSelection] = useState<{
        html: string;
        text: string;
    } | null>(null);

    const [selectingAudioFor, setSelectingAudioFor] = useState<string | null>(
        null,
    );

    const updateField = useCallback((fieldName: string, value: string) => {
        setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    }, []);

    const fillFieldFromDictionary = useCallback(
        (fieldName: string, block: CardSourceDictionaryBlock) => {
            const header = `<h3>${block.dictionaryName}</h3>`;
            const combined = `${header}\n${block.htmlContent}`;
            updateField(fieldName, combined);
        },
        [updateField],
    );

    const fillFieldFromSelection = useCallback(
        (fieldName: string) => {
            if (!lastSelection) return;
            const spec = FIELD_SPECS.find((s) => s.name === fieldName);
            const value = spec?.multiline
                ? lastSelection.html
                : lastSelection.text;
            updateField(fieldName, value);
        },
        [lastSelection, updateField],
    );

    React.useEffect(() => {
        if (!isOpen) {
            setFieldValues(initialFieldValues);
        }
    });

    React.useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (!range.collapsed) {
                    const rightPanel = document.querySelector(
                        `.${styles.right}`,
                    );
                    if (
                        rightPanel &&
                        rightPanel.contains(range.commonAncestorContainer)
                    ) {
                        const container = document.createElement("div");
                        container.appendChild(range.cloneContents());
                        setLastSelection({
                            html: container.innerHTML,
                            text: selection.toString(),
                        });
                    }
                }
            }
        };

        document.addEventListener("selectionchange", handleSelectionChange);
        return () => {
            document.removeEventListener(
                "selectionchange",
                handleSelectionChange,
            );
        };
    }, []);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (!selectingAudioFor) return;

            const target = e.target as HTMLElement;
            const link = target.closest("a");
            if (link && link.href) {
                const href = link.getAttribute("href") || "";
                if (href.startsWith("sound://")) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Same logic as in SandboxedDefinitionBlock
                    const parts = href.split("?");
                    const params = new URLSearchParams(parts[1] || "");
                    const key = params.get("key");
                    if (key) {
                        updateField(selectingAudioFor, `[sound:${key}]`);
                        setSelectingAudioFor(null);
                    }
                }
            }
        };

        // Capture to intercept clicks before other handlers
        document.addEventListener("click", handleClick, true);
        return () => {
            document.removeEventListener("click", handleClick, true);
        };
    }, [selectingAudioFor, updateField]);

    const handleSubmit = useCallback(() => {
        const payload = {
            searchWord: context.searchWord,
            fields: fieldValues,
            sourceDictionaries: context.blocks.map((b) => ({
                dictionaryId: b.dictionaryId,
                dictionaryName: b.dictionaryName,
            })),
        };

        // MVP stub: later we will send this to main process / AnkiConnect.
        console.log("[AnkiCardModal] Draft submit:", payload);
        onClose();
    }, [context.blocks, context.searchWord, fieldValues, onClose]);

    const handleOverlayMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose();
        },
        [onClose],
    );

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onMouseDown={handleOverlayMouseDown}>
            <div className={styles.modal} role="dialog" aria-modal="true">
                <div className={styles.header}>
                    <div className={styles.title}>
                        Create Anki Card — “{context.searchWord}”
                    </div>
                    <button className={styles.footerBtn} onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.left}>
                        <p className={styles.sectionTitle}>
                            Fields (hard-coded)
                        </p>

                        {FIELD_SPECS.map((spec) => {
                            if (spec.type === "audio") {
                                return (
                                    <div
                                        key={spec.name}
                                        className={styles.field}
                                    >
                                        <div className={styles.fieldLabelRow}>
                                            <div className={styles.fieldLabel}>
                                                {spec.name} (audio)
                                            </div>
                                            <button
                                                className={`${styles.useDictBtn} ${selectingAudioFor === spec.name ? styles.active : ""}`}
                                                onClick={() =>
                                                    setSelectingAudioFor(
                                                        selectingAudioFor ===
                                                            spec.name
                                                            ? null
                                                            : spec.name,
                                                    )
                                                }
                                            >
                                                {selectingAudioFor === spec.name
                                                    ? "Cancel"
                                                    : "Select Audio"}
                                            </button>
                                        </div>
                                        <input
                                            className={styles.input}
                                            value={fieldValues[spec.name] || ""}
                                            onChange={(e) =>
                                                updateField(
                                                    spec.name,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Select audio from right panel"
                                        />
                                    </div>
                                );
                            }

                            const value = fieldValues[spec.name] ?? "";
                            return (
                                <div key={spec.name} className={styles.field}>
                                    <div className={styles.fieldLabelRow}>
                                        <div className={styles.fieldLabel}>
                                            {spec.name}
                                        </div>
                                        {lastSelection && (
                                            <button
                                                className={styles.useDictBtn}
                                                onClick={() =>
                                                    fillFieldFromSelection(
                                                        spec.name,
                                                    )
                                                }
                                                title="Fill this field with currently selected content from dictionary"
                                            >
                                                Fill Selection
                                            </button>
                                        )}
                                    </div>

                                    {spec.multiline ? (
                                        <textarea
                                            className={styles.textarea}
                                            value={value}
                                            onChange={(e) =>
                                                updateField(
                                                    spec.name,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Empty by default. Use the right panel to choose a dictionary as starting value."
                                        />
                                    ) : (
                                        <input
                                            className={styles.input}
                                            value={value}
                                            onChange={(e) =>
                                                updateField(
                                                    spec.name,
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="Empty by default"
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div
                        className={`${styles.right} ${selectingAudioFor ? styles.selectingAudio : ""}`}
                    >
                        {selectingAudioFor && (
                            <div className={styles.audioModeHint}>
                                <span>
                                    Click an audio icon in the dictionary to
                                    select it for “{selectingAudioFor}”
                                </span>
                                <button
                                    className={styles.dictActionBtn}
                                    style={{
                                        color: "inherit",
                                        borderColor: "currentColor",
                                    }}
                                    onClick={() => setSelectingAudioFor(null)}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                        <p className={styles.sectionTitle}>
                            Dictionary contents (expanded)
                        </p>

                        {context.blocks.length === 0 ? (
                            <div style={{ color: "#a0a0a0" }}>
                                No dictionary content available for this search.
                            </div>
                        ) : (
                            context.blocks.map((block) => (
                                <div
                                    key={block.dictionaryId}
                                    className={styles.dictBlock}
                                >
                                    <div className={styles.dictHeader}>
                                        <div className={styles.dictName}>
                                            {block.dictionaryName}
                                        </div>
                                        <div className={styles.dictActions}>
                                            <button
                                                className={styles.dictActionBtn}
                                                onClick={() =>
                                                    fillFieldFromDictionary(
                                                        "Back",
                                                        block,
                                                    )
                                                }
                                                title="Use this dictionary as Back field starting value"
                                            >
                                                Use as Back
                                            </button>
                                            <button
                                                className={styles.dictActionBtn}
                                                onClick={() =>
                                                    updateField(
                                                        "Front",
                                                        context.searchWord,
                                                    )
                                                }
                                                title="Fill Front with search word"
                                            >
                                                Use as Front
                                            </button>
                                        </div>
                                    </div>

                                    {(() => {
                                        const dictConfig =
                                            config?.configs[block.dictionaryId];
                                        const enabledResources =
                                            dictConfig?.enabledResources || {};
                                        const customCss = Object.keys(
                                            enabledResources,
                                        )
                                            .filter(
                                                (path) =>
                                                    path.endsWith(".css") &&
                                                    enabledResources[path],
                                            )
                                            .map(
                                                (path) =>
                                                    userScripts[path] || "",
                                            )
                                            .join("\n");

                                        const customJs = Object.keys(
                                            enabledResources,
                                        )
                                            .filter(
                                                (path) =>
                                                    path.endsWith(".js") &&
                                                    enabledResources[path],
                                            )
                                            .map(
                                                (path) =>
                                                    userScripts[path] || "",
                                            )
                                            .join("\n");

                                        const isSystemBlock =
                                            block.dictionaryId.startsWith(
                                                "system-",
                                            );

                                        const renderBlock: RenderedDefinitionBlock =
                                            {
                                                id: block.dictionaryId,
                                                dictionaryId:
                                                    block.dictionaryId,
                                                dictionaryName:
                                                    block.dictionaryName,
                                                htmlContent:
                                                    block.htmlContent ||
                                                    "<i>(empty)</i>",
                                                isLoading: false,
                                            };

                                        if (isSystemBlock) {
                                            return (
                                                <div
                                                    className={
                                                        styles.dictContent
                                                    }
                                                    dangerouslySetInnerHTML={{
                                                        __html:
                                                            block.htmlContent ||
                                                            "<i>(empty)</i>",
                                                    }}
                                                />
                                            );
                                        }

                                        return (
                                            <SandboxedDefinitionBlock
                                                block={renderBlock}
                                                isFirst={false}
                                                onEntryLinkClick={() => {}}
                                                onSelectionChange={
                                                    setLastSelection
                                                }
                                                onAudioSelected={(key) => {
                                                    if (selectingAudioFor) {
                                                        updateField(
                                                            selectingAudioFor,
                                                            `[sound:${key}]`,
                                                        );
                                                        setSelectingAudioFor(
                                                            null,
                                                        );
                                                    }
                                                }}
                                                isAudioSelectionMode={
                                                    !!selectingAudioFor
                                                }
                                                customCss={customCss}
                                                customJs={customJs}
                                            />
                                        );
                                    })()}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.footerBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={`${styles.footerBtn} ${styles.primaryBtn}`}
                        onClick={handleSubmit}
                    >
                        Create (stub)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnkiCardModal;
