import React from "react";

// ---------------------------------------------------------------------------
// Renders Discord-style markdown the same way Discord itself displays it:
// **bold**, *italic*, __underline__, ~~strikethrough~~, `code`, # headings,
// - bullet lists, > blockquotes, and bare URLs turned into links.
// ---------------------------------------------------------------------------

let keySeed = 0;
const nextKey = () => `n${keySeed++}`;

/** Inline formatting within a single line — bold/italic/underline/strike/code/links/emoji. */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|`([^`]+)`|<(a?):(\w+):(\d+)>|(https?:\/\/\S+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={nextKey()}>
          <em>{m[2]}</em>
        </strong>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(<strong key={nextKey()}>{m[3]}</strong>);
    } else if (m[4] !== undefined) {
      nodes.push(<u key={nextKey()}>{m[4]}</u>);
    } else if (m[5] !== undefined) {
      nodes.push(<s key={nextKey()}>{m[5]}</s>);
    } else if (m[6] !== undefined) {
      nodes.push(<em key={nextKey()}>{m[6]}</em>);
    } else if (m[7] !== undefined) {
      nodes.push(
        <code
          key={nextKey()}
          className="rounded bg-surface3 px-1.5 py-0.5 font-mono text-[0.85em]"
        >
          {m[7]}
        </code>,
      );
    } else if (m[9] !== undefined && m[10] !== undefined) {
      // custom Discord emoji <:name:id> / animated <a:name:id> — rendered from its CDN image
      const animated = m[8] === "a";
      const name = m[9];
      const id = m[10];
      nodes.push(
        <img
          key={nextKey()}
          src={`https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}`}
          alt={`:${name}:`}
          title={`:${name}:`}
          className="inline-block h-[1.375em] w-[1.375em] translate-y-[0.25em] align-baseline"
        />,
      );
    } else if (m[11] !== undefined) {
      nodes.push(
        <a
          key={nextKey()}
          href={m[11]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {m[11]}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface Block {
  type: "h1" | "h2" | "h3" | "quote" | "ul" | "p";
  lines: string[];
}

function toBlocks(content: string): Block[] {
  const rawLines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  for (const raw of rawLines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: "p", lines: [] }); // blank line -> paragraph break
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    if (heading) {
      const level = `h${heading[1].length}` as Block["type"];
      blocks.push({ type: level, lines: [heading[2]] });
    } else if (bullet) {
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "ul") prev.lines.push(bullet[1]);
      else blocks.push({ type: "ul", lines: [bullet[1]] });
    } else if (quote) {
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "quote") prev.lines.push(quote[1]);
      else blocks.push({ type: "quote", lines: [quote[1]] });
    } else {
      const prev = blocks[blocks.length - 1];
      if (prev?.type === "p" && prev.lines.length > 0) prev.lines.push(line);
      else blocks.push({ type: "p", lines: [line] });
    }
  }
  return blocks.filter((b) => b.lines.length > 0);
}

const HEADING_CLS: Record<string, string> = {
  h1: "text-lg font-extrabold text-txt",
  h2: "text-base font-extrabold text-txt",
  h3: "text-sm font-extrabold text-txt",
};

export const DiscordText: React.FC<{ content: string; className?: string }> = ({
  content,
  className,
}) => {
  const blocks = toBlocks(content);
  return (
    <div
      className={`flex flex-col gap-2 text-[14px] leading-relaxed text-txt ${className ?? ""}`}
    >
      {blocks.map((block, i) => {
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.lines.map((l, j) => (
                <li key={j}>{renderInline(l)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-line2 pl-3 text-muted"
            >
              {block.lines.map((l, j) => (
                <p key={j}>{renderInline(l)}</p>
              ))}
            </blockquote>
          );
        }
        if (block.type === "h1" || block.type === "h2" || block.type === "h3") {
          return (
            <p key={i} className={HEADING_CLS[block.type]}>
              {renderInline(block.lines[0])}
            </p>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block.lines.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export default DiscordText;
