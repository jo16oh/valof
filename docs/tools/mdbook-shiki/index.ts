import { pathToFileURL } from "node:url";

import { fromMarkdown } from "mdast-util-from-markdown";
import { createHighlighter } from "shiki";
import type { BundledLanguage, BundledTheme } from "shiki";

type Language = BundledLanguage | "text";

type CodeNode = {
  type: "code";
  value: string;
  lang?: string | null;
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

type Options = {
  lightTheme?: BundledTheme | undefined;
  darkTheme?: BundledTheme | undefined;
  fallbackLanguage?: Language | undefined;
  onWarning?: ((message: string) => void) | undefined;
};

type Chapter = {
  content: string;
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
      shiki?: {
        "light-theme"?: BundledTheme;
        "dark-theme"?: BundledTheme;
        "fallback-language"?: Language;
      };
    };
  };
};

type PreprocessorInput = [Context, Book];

const defaults = {
  lightTheme: "github-light",
  darkTheme: "github-dark",
  fallbackLanguage: "text",
} satisfies Required<Omit<Options, "onWarning">>;

const languages = ["text", "bash", "javascript", "typescript"] satisfies Language[];

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

function fenceLanguage(node: CodeNode, fallbackLanguage: Language): string {
  return node.lang?.split(",", 1).at(0)?.trim() || fallbackLanguage;
}

function isFence(markdown: string, node: CodeNode): boolean {
  const start = node.position?.start.offset;
  if (start === undefined) {
    return false;
  }

  return /^(?: {0,3})(?:`{3,}|~{3,})/.test(markdown.slice(start));
}

export async function createMarkdownHighlighter(options: Options = {}) {
  const settings = {
    lightTheme: options.lightTheme ?? defaults.lightTheme,
    darkTheme: options.darkTheme ?? defaults.darkTheme,
    fallbackLanguage: options.fallbackLanguage ?? defaults.fallbackLanguage,
    onWarning: options.onWarning,
  };
  const highlighter = await createHighlighter({
    themes: [settings.lightTheme, settings.darkTheme],
    langs: languages,
  });
  const loadedLanguages = new Set(highlighter.getLoadedLanguages());
  loadedLanguages.add("text");

  if (!loadedLanguages.has(settings.fallbackLanguage)) {
    highlighter.dispose();
    throw new Error(`Shiki fallback language is not loaded: ${settings.fallbackLanguage}`);
  }

  return {
    transform(markdown: string): string {
      const replacements: Array<{ start: number; end: number; html: string }> = [];

      for (const node of codeNodes(fromMarkdown(markdown))) {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined || !isFence(markdown, node)) {
          continue;
        }

        const requestedLanguage = fenceLanguage(node, settings.fallbackLanguage);
        const language: Language = loadedLanguages.has(requestedLanguage)
          ? (requestedLanguage as Language)
          : settings.fallbackLanguage;

        if (language !== requestedLanguage) {
          settings.onWarning?.(
            `Shiki: unknown language "${requestedLanguage}", using "${language}"`,
          );
        }

        replacements.push({
          start,
          end,
          html: highlighter.codeToHtml(node.value, {
            lang: language,
            themes: {
              light: settings.lightTheme,
              dark: settings.darkTheme,
            },
            defaultColor: false,
          }),
        });
      }

      return replacements
        .reverse()
        .reduce(
          (result, replacement) =>
            result.slice(0, replacement.start) + replacement.html + result.slice(replacement.end),
          markdown,
        );
    },
    dispose() {
      highlighter.dispose();
    },
  };
}

function transformChapters(section: BookItem[], transform: (markdown: string) => string): void {
  for (const item of section) {
    const chapter = item.Chapter;
    if (!chapter) {
      continue;
    }

    chapter.content = transform(chapter.content);
    transformChapters(chapter.sub_items, transform);
  }
}

export async function preprocess(
  input: PreprocessorInput,
  onWarning: (message: string) => void = console.error,
): Promise<Book> {
  const [context, book] = input;
  const config = context.config?.preprocessor?.shiki ?? {};
  const markdownHighlighter = await createMarkdownHighlighter({
    lightTheme: config["light-theme"],
    darkTheme: config["dark-theme"],
    fallbackLanguage: config["fallback-language"],
    onWarning,
  });

  try {
    transformChapters(book.items, (content) => markdownHighlighter.transform(content));
    return book;
  } finally {
    markdownHighlighter.dispose();
  }
}

async function main() {
  if (process.argv[2] === "supports") {
    process.exitCode = process.argv[3] === "html" ? 0 : 1;
    return;
  }

  process.stdin.setEncoding("utf8");
  let stdin = "";
  for await (const chunk of process.stdin) {
    stdin += chunk;
  }

  const input = JSON.parse(stdin);
  process.stdout.write(JSON.stringify(await preprocess(input)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
