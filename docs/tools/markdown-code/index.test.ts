import { describe, expect, test } from "vite-plus/test";

import { codeBlocks, isTypeScript } from "./index.ts";

describe("codeBlocks", () => {
  test("reads the language and the attributes after it", () => {
    const [plain, ignored] = codeBlocks(
      ["```ts", "const a = 1;", "```", "", "```ts,ignore", "const b = 2;", "```"].join("\n"),
    );

    expect(plain).toMatchObject({ language: "ts", attributes: [], line: 1 });
    expect(ignored).toMatchObject({ language: "ts", attributes: ["ignore"], line: 5 });
  });

  test("reports an unlabeled fence as an empty language", () => {
    expect(codeBlocks("```\nplain\n```")).toMatchObject([{ language: "", attributes: [] }]);
  });

  test("leaves an indented block alone", () => {
    expect(codeBlocks("    const indented = 1;\n")).toEqual([]);
  });

  test("gives offsets that cover the whole fence", () => {
    const markdown = "text\n\n```ts\nconst a = 1;\n```\n";
    const [block] = codeBlocks(markdown);
    if (!block) {
      throw new Error("the fixture has one block");
    }

    expect(markdown.slice(block.start, block.end)).toBe("```ts\nconst a = 1;\n```");
  });
});

describe("isTypeScript", () => {
  test("accepts both spellings", () => {
    expect([isTypeScript("ts"), isTypeScript("typescript"), isTypeScript("js")]).toEqual([
      true,
      true,
      false,
    ]);
  });
});
