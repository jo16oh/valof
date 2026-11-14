import { createHighlighter } from "shiki";
import type { BundledLanguage, BundledTheme } from "shiki";
import { removeTwoslashNotations } from "twoslash/fallback";

import { codeBlocks, isTypeScript } from "../markdown-code/index.ts";

const DEFAULTS = {
  lightTheme: "github-light",
  darkTheme: "github-dark",
  fallbackLanguage: "text",
} satisfies Required<Omit<Options, "onWarning">>;

const LANGUAGES = ["text", "bash", "javascript", "typescript"] satisfies Language[];

export type PreprocessorInput = [Context, Book];

export async function createMarkdownHighlighter(options: Options = {}) {
  const settings = {
    lightTheme: options.lightTheme ?? DEFAULTS.lightTheme,
    darkTheme: options.darkTheme ?? DEFAULTS.darkTheme,
    fallbackLanguage: options.fallbackLanguage ?? DEFAULTS.fallbackLanguage,
    onWarning: options.onWarning,
  };
  const highlighter = await createHighlighter({
    themes: [settings.lightTheme, settings.darkTheme],
    langs: LANGUAGES,
  });
  const loadedLanguages = new Set([...highlighter.getLoadedLanguages(), "text"]);

  if (!loadedLanguages.has(settings.fallbackLanguage)) {
    highlighter.dispose();
    throw new Error(`Shiki fallback language is not loaded: ${settings.fallbackLanguage}`);
  }

  return {
    transform(markdown: string): string {
      const replacements: Array<{ start: number; end: number; html: string }> = [];

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
