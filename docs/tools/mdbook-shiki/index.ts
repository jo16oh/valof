import { pathToFileURL } from "node:url";

import { createHighlighter } from "shiki";
import type { BundledLanguage, BundledTheme } from "shiki";
import { removeTwoslashNotations } from "twoslash/fallback";

import { codeBlocks, isTypeScript } from "../markdown-code/index.ts";

type Language = BundledLanguage | "text";

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

  const highlight = (code: string): string =>
    highlighter.codeToHtml(code, {
      lang: "typescript",
      themes: { light: settings.lightTheme, dark: settings.darkTheme },
      defaultColor: false,
      structure: "inline",
    });

  return {
    transform(markdown: string): string {
      const replacements: Replacement[] = [];

      for (const block of codeBlocks(markdown)) {
        const requestedLanguage = block.language || settings.fallbackLanguage;
        const language: Language = loadedLanguages.has(requestedLanguage)
          ? (requestedLanguage as Language)
          : settings.fallbackLanguage;

        if (language !== requestedLanguage) {
          settings.onWarning?.(
            `Shiki: unknown language "${requestedLanguage}", using "${language}"`,
          );
        }

        // The notations are what `docs/tools/twoslash` typechecks the block with. Removing them
        // here, with Twoslash's own function, keeps the two readings of a block identical.
        const code = isTypeScript(language) ? removeTwoslashNotations(block.value) : block.value;

        replacements.push({
          start: block.start,
          end: block.end,
          html: highlighter.codeToHtml(code, {
            lang: language,
            themes: {
              light: settings.lightTheme,
              dark: settings.darkTheme,
            },
            defaultColor: false,
          }),
        });
      }

      replacements.push(...firstCellCalls(markdown, replacements, highlight));
      replacements.sort((a, b) => a.start - b.start);

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

type Replacement = { start: number; end: number; html: string };

/**
 * Highlights the first cell of a table row where the cell is a single call, such as
 * `| \`.implSeal(f)\` |` in the API Reference. A type or an option name stays plain: TypeScript's
 * grammar reads `Val<K, T>` as a comparison.
 */
function firstCellCalls(
  markdown: string,
  blocks: readonly Replacement[],
  highlight: (code: string) => string,
): Replacement[] {
  const found: Replacement[] = [];
  const cell = /^\|\s*`([^`|]*\([^`|]*)`\s*\|/;
  let offset = 0;

  for (const line of markdown.split("\n")) {
    const match = cell.exec(line);
    const inBlock = blocks.some((block) => offset >= block.start && offset < block.end);
    if (match?.[1] !== undefined && !inBlock) {
      const start = offset + line.indexOf("`");
      found.push({
        start,
        end: start + match[1].length + 2,
        html: `<code class="shiki-inline">${unsmart(highlight(match[1]))}</code>`,
      });
    }
    offset += line.length + 1;
  }

  return found;
}

/**
 * mdBook's smart punctuation reads the text inside inline HTML, and would turn `...` into `…` and
 * straight quotes into curly ones. Character references in the text nodes keep them as written.
 */
function unsmart(html: string): string {
  return html.replace(
    />([^<]*)</g,
    (_, text: string) =>
      `>${text.replaceAll(".", "&#46;").replaceAll("-", "&#45;").replaceAll("'", "&#39;").replaceAll('"', "&#34;")}<`,
  );
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
