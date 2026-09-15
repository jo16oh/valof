import { fromMarkdown } from "mdast-util-from-markdown";

/**
 * A fenced code block. `attributes` are the comma-separated words after the language, following
 * mdBook's own ```rust,ignore spelling. A colon would break the language lookup instead: mdast
 * reads the whole info word as the language, so ```ts:ignore is a language named `ts:ignore`.
 */
export type CodeBlock = {
  language: string;
  attributes: string[];
  value: string;
  /** 1-based, within the chapter. */
  line: number;
  /** Byte offsets of the fence in the source markdown, for replacing it. */
  start: number;
  end: number;
};

type CodeNode = {
  type: "code";
  value: string;
  lang?: string | null;
  position?: {
    start: { offset?: number; line?: number };
    end: { offset?: number };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCodeNode(value: unknown): value is CodeNode {
  return isRecord(value) && value.type === "code" && typeof value.value === "string";
}

function codeNodes(node: unknown, found: CodeNode[] = []): CodeNode[] {
  if (!isRecord(node)) {
    return found;
  }

  const children = node.children;
  if (isCodeNode(node)) {
    found.push(node);
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      codeNodes(child, found);
    }
  }

  return found;
}

// An indented code block has no info string, so it can carry neither a language nor an attribute.
function isFence(markdown: string, node: CodeNode): boolean {
  const start = node.position?.start.offset;
  if (start === undefined) {
    return false;
  }

  return /^(?: {0,3})(?:`{3,}|~{3,})/.test(markdown.slice(start));
}

/** Shiki accepts either spelling, and the book writes ```ts. */
export function isTypeScript(language: string): boolean {
  return language === "ts" || language === "typescript";
}

export function codeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  for (const node of codeNodes(fromMarkdown(markdown))) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || !isFence(markdown, node)) {
      continue;
    }

    const [language = "", ...attributes] = (node.lang ?? "").split(",").map((part) => part.trim());

    blocks.push({
      language,
      attributes: attributes.filter(Boolean),
      value: node.value,
      line: node.position?.start.line ?? 0,
      start,
      end,
    });
  }

  return blocks;
}
