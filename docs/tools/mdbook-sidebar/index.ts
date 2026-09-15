import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";

type Node = {
  type?: string;
  depth?: number;
  value?: string;
  alt?: string;
  children?: Node[];
};

type Chapter = {
  content: string;
  number?: number[] | null;
  path?: string;
  sub_items: BookItem[];
};

type BookItem = {
  Chapter?: Chapter;
};

type Book = {
  items: BookItem[];
};

type Context = {
  config?: {
    preprocessor?: {
      sidebar?: {
        "default-open"?: boolean;
      };
    };
  };
};

type PreprocessorInput = [Context, Book];

export type Heading = {
  depth: number;
  id: string;
  text: string;
};

export type HeadingData = Record<string, Heading[]>;

export type SidebarData = {
  defaultOpen: boolean;
  headings: HeadingData;
};

function textOf(node: Node): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  if (typeof node.alt === "string") {
    return node.alt;
  }
  return node.children?.map(textOf).join("") ?? "";
}

function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s/g, "-")
    .replace(/[^\p{Letter}\p{Number}_-]/gu, "");
}

export function headingsFromMarkdown(markdown: string): Heading[] {
  const root = fromMarkdown(markdown) as Node;
  const ids = new Map<string, number>();
  const headings: Heading[] = [];

  for (const node of root.children ?? []) {
    if (node.type !== "heading" || node.depth === undefined) {
      continue;
    }

    const text = textOf(node);
    const base = slug(text);
    const duplicate = ids.get(base) ?? 0;
    ids.set(base, duplicate + 1);
    if (node.depth >= 2) {
      headings.push({
        depth: node.depth,
        id: duplicate === 0 ? base : `${base}-${duplicate}`,
        text,
      });
    }
  }

  return headings;
}

export function headingsFromBook(book: Book): HeadingData {
  const headings: HeadingData = {};

  function visit(items: BookItem[]): void {
    for (const item of items) {
      const chapter = item.Chapter;
      if (!chapter) {
        continue;
      }
      if (chapter.path && Array.isArray(chapter.number)) {
        const href = posix.normalize(chapter.path).replace(/\.md$/i, ".html");
        headings[href] = headingsFromMarkdown(chapter.content);
      }
      visit(chapter.sub_items);
    }
  }

  visit(book.items);
  return headings;
}

export function sidebarScript(data: SidebarData): string {
  return `globalThis.mdbookSidebar = ${JSON.stringify(data)};\n`;
}

export function preprocess(
  input: PreprocessorInput,
  write: (data: SidebarData) => void = writeSidebarScript,
): Book {
  const [context, book] = input;
  write({
    defaultOpen: context.config?.preprocessor?.sidebar?.["default-open"] ?? true,
    headings: headingsFromBook(book),
  });
  return book;
}

function writeSidebarScript(data: SidebarData): void {
  const path = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../.generated/mdbook-sidebar/headings.js",
  );
  const content = sidebarScript(data);
  try {
    if (readFileSync(path, "utf8") === content) {
      return;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function main(): void {
  if (process.argv[2] === "supports") {
    process.exitCode = process.argv[3] === "html" ? 0 : 1;
    return;
  }

  const input = JSON.parse(readFileSync(0, "utf8")) as PreprocessorInput;
  process.stdout.write(JSON.stringify(preprocess(input)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
