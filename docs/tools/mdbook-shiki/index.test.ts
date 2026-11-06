import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { createMarkdownHighlighter, preprocess } from "../mdbook-shiki/index.ts";

describe("mdBook Shiki preprocessor", () => {
  let markdownHighlighter: Awaited<ReturnType<typeof createMarkdownHighlighter>>;
  // A language missing from the list falls back to text, which only the warning tells apart.
  const fallback = vi.fn();

  beforeAll(async () => {
    markdownHighlighter = await createMarkdownHighlighter({ onWarning: fallback });
  });

  afterAll(() => {
    markdownHighlighter.dispose();
  });

  test("highlights the languages used by the book", () => {
    const markdown = [
      "```ts",
      'const value: string = "<&>";',
      "```",
      "",
      "```bash",
      "vp run docs:build",
      "```",
      "",
      "```js",
      "export default {};",
      "```",
    ].join("\n");

    const result = markdownHighlighter.transform(markdown);

    expect(result.match(/class="shiki /g)).toHaveLength(3);
    expect(result).toContain("--shiki-light:");
    expect(result).toContain("--shiki-dark:");
    expect(fallback).not.toHaveBeenCalled();
  });

  test("removes the Twoslash notations the check reads", () => {
    const markdown = [
      "```ts",
      "// @errors: 2322",
      "declare const hidden: string;",
      "// ---cut---",
      "const shown = 1;",
      "```",
    ].join("\n");

    const result = markdownHighlighter.transform(markdown);

    expect(result).toContain("shown");
    expect(result).not.toContain("---cut---");
    expect(result).not.toContain("@errors");
    expect(result).not.toContain("hidden");
  });

  test("handles unlabeled, tilde, and longer fences", () => {
    const markdown = ["````ts", "const fence = ```;", "````", "", "~~~", "plain text", "~~~"].join(
      "\n",
    );

    const result = markdownHighlighter.transform(markdown);

    expect(result.match(/class="shiki /g)).toHaveLength(2);
    expect(result).toContain("plain text");
    expect(result).not.toContain("~~~");
  });

  test("warns once and uses text for an unknown language", async () => {
    const onWarning = vi.fn();
    const transformer = await createMarkdownHighlighter({ onWarning });

    try {
      const result = transformer.transform("```unknown\nconst x = 1;\n```");

      expect(onWarning).toHaveBeenCalledOnce();
      expect(onWarning).toHaveBeenCalledWith('Shiki: unknown language "unknown", using "text"');
      expect(result).toContain("const x = 1;");
      expect(result).not.toContain('style="--shiki-light:#D73A49');
    } finally {
      transformer.dispose();
    }
  });

  test("transforms nested chapters with configured themes", async () => {
    const input: Parameters<typeof preprocess>[0] = [
      {
        config: {
          preprocessor: {
            shiki: {
              "light-theme": "min-light",
              "dark-theme": "min-dark",
              "fallback-language": "text",
            },
          },
        },
      },
      {
        items: [
          {
            Chapter: {
              content: "```ts\nconst top = true;\n```",
              sub_items: [
                {
                  Chapter: {
                    content: "```ts\nconst nested = true;\n```",
                    sub_items: [],
                  },
                },
              ],
            },
          },
        ],
      },
    ];

    const book = await preprocess(input);
    const top = book.items[0]?.Chapter;
    const nested = top?.sub_items[0]?.Chapter;
    if (!top || !nested) {
      throw new Error("fixture chapters are missing");
    }

    // Not the defaults, so the setting is what picks them.
    expect(top.content).toContain('class="shiki shiki-themes min-light min-dark"');
    expect(nested.content).toContain('class="shiki shiki-themes min-light min-dark"');
  });
});
