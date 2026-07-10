import type React from "react";
import { openNativeUrl } from "../lib/native";
import { getSafeMarkdownUrl } from "../lib/urlSafety";
import type { ContentItem } from "../types";

function isMarkdownItem(item: ContentItem) {
  const target = `${item.fileName ?? ""} ${item.location ?? ""} ${item.title ?? ""}`.toLowerCase();
  return /\.(md|markdown)(\s|$|\?)/.test(target);
}

function isMarkdownBlockStart(line: string) {
  const trimmed = line.trim();
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^-{3,}$/.test(trimmed) ||
    /^>{1}\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^```/.test(trimmed)
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(token.slice(2, -2), `${key}-strong`)}</strong>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key}>{renderInlineMarkdown(token.slice(1, -1), `${key}-em`)}</em>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{renderInlineMarkdown(token.slice(2, -2), `${key}-del`)}</del>);
    } else if (token.startsWith("[[")) {
      nodes.push(<span className="markdownWikiLink" key={key}>{token.slice(2, -2)}</span>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const safeUrl = getSafeMarkdownUrl(linkMatch[2]);
        if (safeUrl) {
          nodes.push(
            <a
              key={key}
              href={safeUrl}
              target={safeUrl.startsWith("#") ? undefined : "_blank"}
              rel={safeUrl.startsWith("#") ? undefined : "noreferrer"}
              onClick={(event) => {
                if (safeUrl.startsWith("#")) return;
                event.preventDefault();
                openNativeUrl(safeUrl).catch(() => window.open(safeUrl, "_blank", "noopener,noreferrer"));
              }}
            >
              {renderInlineMarkdown(linkMatch[1], `${key}-link`)}
            </a>,
          );
        } else {
          nodes.push(renderInlineMarkdown(linkMatch[1], `${key}-invalid-link`));
        }
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMarkdownBlocks(text: string) {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      blocks.push(
        <pre className="markdownCodeBlock" key={`code-${index}`}>
          {language && <span>{language}</span>}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4);
      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
      blocks.push(<HeadingTag key={`heading-${index}`}>{renderInlineMarkdown(headingMatch[2], `heading-${index}`)}</HeadingTag>);
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderMarkdownBlocks(quoteLines.join("\n"))}</blockquote>);
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        const itemText = lines[index].trim().replace(/^[-*+]\s+/, "");
        const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.+)$/);
        items.push(
          <li className={taskMatch ? "markdownTaskItem" : undefined} key={`ul-${index}`}>
            {taskMatch && <input type="checkbox" checked={taskMatch[1].toLowerCase() === "x"} readOnly />}
            {renderInlineMarkdown(taskMatch ? taskMatch[2] : itemText, `ul-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`ul-list-${index}`}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        const itemText = lines[index].trim().replace(/^\d+\.\s+/, "");
        items.push(<li key={`ol-${index}`}>{renderInlineMarkdown(itemText, `ol-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-list-${index}`}>{items}</ol>);
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(paragraphLines.join(" "), `p-${index}`)}</p>);
  }

  return blocks;
}

export function DocumentTextView({
  item,
  text,
  fallbackText,
  variant = "full",
}: {
  item: ContentItem;
  text: string;
  fallbackText: string;
  variant?: "full" | "preview";
}) {
  if (!text) {
    return <div className="readerEmptyText">{fallbackText}</div>;
  }

  if (variant === "preview") {
    return <div className="documentPreviewExcerpt">{getDocumentPreviewText(text)}</div>;
  }

  if (isMarkdownItem(item)) {
    return <div className="markdownDocument">{renderMarkdownBlocks(text)}</div>;
  }

  return <div className="readerText">{text}</div>;
}

function getDocumentPreviewText(text: string) {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= 420) {
    return cleaned;
  }

  return `${cleaned.slice(0, 420).trim()}...`;
}
