import React from "react";

/**
 * A small Markdown renderer for author-written documentation.
 *
 * Safe by construction: it builds React elements and never uses
 * `dangerouslySetInnerHTML`, so author text is always rendered as text (React
 * escapes it). Raw HTML such as `<script>` or `<img onerror>` shows up
 * literally instead of executing. Links are the only place author input
 * becomes an attribute, and they are restricted to http(s) and mailto URLs;
 * anything else (`javascript:`, `data:`, relative paths) renders as plain
 * text. Code is displayed in `<pre><code>`, never evaluated.
 *
 * Supported: ATX headings, paragraphs, unordered and ordered lists, fenced
 * code blocks, inline code, **bold**, *italic*, and [links](https://…).
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** The URL, if it is one the renderer will link to. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  // Absolute URLs only: no protocol-relative or relative paths.
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return null;
  try {
    const url = new URL(href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\*([^*\n]+)\*|_([^_\n]+)_/;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.85em] text-purple-200">
          {m[2]}
        </code>,
      );
    } else if (m[3] !== undefined) {
      out.push(<strong key={key}>{renderInline(m[3], key)}</strong>);
    } else if (m[4] !== undefined) {
      const href = safeHref(m[5]);
      out.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
          >
            {renderInline(m[4], key)}
          </a>
        ) : (
          <React.Fragment key={key}>{renderInline(m[4], key)}</React.Fragment>
        ),
      );
    } else {
      out.push(<em key={key}>{renderInline(m[6] ?? m[7], key)}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; start: number; items: string[] }
  | { type: "code"; language: string; code: string };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const UL_ITEM = /^\s*[-*+]\s+(.*)$/;
const OL_ITEM = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const FENCE = /^\s*(```|~~~)\s*([A-Za-z0-9+#._-]*)\s*$/;

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      // An unclosed fence runs to the end, as in CommonMark.
      blocks.push({ type: "code", language: fence[2].toLowerCase(), code: code.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const ul = UL_ITEM.exec(line);
    const ol = ul ? null : OL_ITEM.exec(line);
    if (ul || ol) {
      flushParagraph();
      const ordered = !!ol;
      const items: string[] = [];
      const start = ol ? Number(ol[1]) : 1;
      while (i < lines.length) {
        const m = ordered ? OL_ITEM.exec(lines[i]) : UL_ITEM.exec(lines[i]);
        if (m) {
          items.push(ordered ? m[2] : m[1]);
          i++;
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          // An indented continuation line belongs to the previous item.
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else {
          break;
        }
      }
      i--;
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

export interface SafeMarkdownProps {
  source: string;
  /**
   * The heading level an author's `#` maps to. The panel titles its sections
   * with h3, so author headings start at h4 and the outline stays correct.
   */
  baseHeadingLevel?: number;
  className?: string;
}

export function SafeMarkdown({ source, baseHeadingLevel = 4, className }: SafeMarkdownProps) {
  const blocks = parseBlocks(source);
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed text-slate-200 break-words"}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "heading": {
            const level = Math.min(6, baseHeadingLevel + block.level - 1);
            const Tag = `h${level}` as "h4";
            return (
              <Tag key={key} className="font-semibold text-white text-sm sm:text-base">
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={key}>{renderInline(block.text, key)}</p>;
          case "list": {
            const items = block.items.map((item, j) => <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>);
            return block.ordered ? (
              <ol key={key} start={block.start} className="list-decimal space-y-1 pl-5">
                {items}
              </ol>
            ) : (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {items}
              </ul>
            );
          }
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200"
                data-language={block.language || undefined}
              >
                <code>{block.code}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}

export default SafeMarkdown;
