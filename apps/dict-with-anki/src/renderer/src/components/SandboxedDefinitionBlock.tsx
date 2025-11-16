import React, { useEffect, useRef, useState, useMemo } from "react";
import type { RenderedDefinitionBlock as BlockData } from "../App";
import styles from "./ContentArea.module.css";

interface SandboxedDefinitionBlockProps {
    block: BlockData;
    isFirst: boolean;
    customCss?: string;
    customJs?: string;
    // onSoundLinkClick 不再需要
    onEntryLinkClick: (word: string) => void;
}

const SandboxedDefinitionBlock: React.FC<SandboxedDefinitionBlockProps> = ({
    block,
    isFirst,
    customCss = "",
    customJs = "",
    onEntryLinkClick,
}) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [iframeHeight, setIframeHeight] = useState<string>("auto");

    const escapedDictionaryId = block.dictionaryId.replace(/\\/g, "\\\\");

    const processedHtml = useMemo(() => {
        if (!block.htmlContent) return "";

        const parser = new DOMParser();
        const doc = parser.parseFromString(block.htmlContent, "text/html");

        doc.querySelectorAll("img").forEach((img) => {
            const src = img.getAttribute("src");
            // 判断条件：
            // 1. src 存在
            // 2. src 不包含 "://" (排除 http://, https://, // 等绝对或协议相对 URL)
            // 3. src 不以 "data:" 开头 (排除 data:image/png;base64,... 等内联图片)
            if (src && !src.includes("://") && !src.startsWith("data:")) {
                // 此时 src 可能是 "image.png", "path/image.png", "/image.png"
                // 我们需要提取出纯粹的 assetKey，不带开头的斜杠
                const assetKey = src.startsWith("/") ? src.substring(1) : src;

                const newSrc = `mdx-asset://resource/get?dictId=${encodeURIComponent(block.dictionaryId)}&key=${encodeURIComponent(assetKey)}`;
                img.setAttribute("src", newSrc);
            }
        });

        // --- [修改] 使用新的 URL 格式处理声音链接 ---
        doc.querySelectorAll("a[href^='sound://']").forEach((link) => {
            const href = link.getAttribute("href")!;
            const soundKey = href.substring("sound://".length);
            const newHref = `sound://resource/play?dictId=${encodeURIComponent(block.dictionaryId)}&key=${encodeURIComponent(soundKey)}`;
            link.setAttribute("href", newHref);
        });

        return doc.body.innerHTML;
    }, [block.htmlContent, block.dictionaryId]); // 依赖项加入 block.dictionaryId

    const srcDocContent = useMemo(() => {
        const injectedScript = `
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link || !link.href) return;

            const href = link.getAttribute('href');

            if (href.startsWith('entry://')) {
                // entry:// 仍然使用 postMessage，因为它需要改变父窗口的 UI 状态
                e.preventDefault(); 
                console.log(href);
                window.parent.postMessage({
                    type: 'link-click',
                    href: href,
                    dictionaryId: "${escapedDictionaryId}" 
                }, '*');
            } else if (href.startsWith('sound://')) {
                // sound:// 使用 fetch 来触发主进程的 protocol handler，同时避免导航
                e.preventDefault(); // 关键！阻止默认的导航行为
                
                                fetch(href)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Network response was not ok for sound file.');
                        }
                        return response.blob(); // 将响应体转换为 Blob 对象
                    })
                    .then(blob => {
                        const audioUrl = URL.createObjectURL(blob); // 为 Blob 创建一个临时 URL
                        const audio = new Audio(audioUrl);
                        audio.play(); // 播放声音

                        // 监听播放结束事件，以便释放内存
                        audio.addEventListener('ended', () => {
                            URL.revokeObjectURL(audioUrl); // 清理，释放内存
                        });
                    })
                    .catch(err => console.error('Failed to fetch and play sound:', href, err));
            }
        });

        // 动态调整 iframe 高度以适应内容 (这部分代码保持不变)
        const resizeObserver = new ResizeObserver(() => {
            const height = document.documentElement.offsetHeight;
            window.parent.postMessage({ type: 'resize', height: height }, '*');
        });
        resizeObserver.observe(document.body);

        window.addEventListener('load', () => {
             const height = document.documentElement.offsetHeight;
             window.parent.postMessage({ type: 'resize', height: height }, '*');
        });
        `;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { margin: 0; padding: 0; font-family: sans-serif; color: #333; }
                    ${customCss}
                </style>
            </head>
            <body>
                ${processedHtml}
                <script>
                    (function() {
                        ${injectedScript}
                        try {
                            ${customJs}
                        } catch (e) {
                            console.error('Error executing custom JS for ${block.dictionaryName}:', e);
                        }
                    })();
                </script>
            </body>
            </html>
        `;
    }, [
        processedHtml,
        block.dictionaryId, // 仍然需要用于 escapedDictionaryId
        block.dictionaryName,
        customCss,
        customJs,
        escapedDictionaryId,
    ]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) {
                return;
            }

            const { type, href, height } = event.data; // dictionaryId 仍然从 postMessage 获取，以防万一

            if (type === "link-click") {
                // 此时只有 entry:// 会触发这个，sound:// 直接被主进程处理了
                if (href.startsWith("entry://")) {
                    const entryWord = href
                        .replace("entry://", "")
                        .replace(/\\/g, "/");
                    onEntryLinkClick(entryWord);
                }
            } else if (type === "resize" && typeof height === "number") {
                setIframeHeight(`${Math.max(height, 20)}px`);
            }
        };

        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, [onEntryLinkClick]);

    const isSystemMessage = block.dictionaryId.startsWith("system-");

    if (isSystemMessage) {
        return (
            <div
                className={styles.dictionaryBox}
                data-dictionary-id={block.dictionaryId}
            >
                {block.htmlContent && (
                    <div
                        dangerouslySetInnerHTML={{ __html: block.htmlContent }}
                    />
                )}
            </div>
        );
    }

    return (
        <div
            className={styles.dictionaryBox}
            data-dictionary-id={block.dictionaryId}
        >
            <h3
                className={`${styles.definitionTitle} ${isFirst ? styles.firstTitle : ""}`}
            >
                {block.dictionaryName}
            </h3>

            {block.isLoading && (
                <div className={styles.loader}>
                    <span>Loading definition...</span>
                </div>
            )}

            {processedHtml && ( // 只有当处理后的 HTML 内容存在时才渲染 iframe
                <iframe
                    ref={iframeRef}
                    srcDoc={srcDocContent}
                    sandbox="allow-scripts"
                    scrolling="no"
                    frameBorder="0"
                    style={{
                        width: "100%",
                        height: iframeHeight,
                        transition: "height 0.2s ease-in-out",
                    }}
                    title={`Definition from ${block.dictionaryName}`}
                />
            )}
        </div>
    );
};

export default SandboxedDefinitionBlock;
