import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { checkBlock, docBlocks } from "./index.ts";

const chapters = fileURLToPath(new URL("../../src", import.meta.url));

describe("the book's TypeScript blocks", () => {
  for (const block of docBlocks(chapters)) {
    test.skipIf(block.ignored)(block.name, () => {
      checkBlock(block.code);
    });
  }
});

describe("checkBlock", () => {
  // Without these two, the suite above passes whether or not anything is being checked.
  test("throws for a block that does not typecheck", () => {
    expect(() => checkBlock('const wrong: number = "1";')).toThrow("2322");
  });

  test("accepts an error the block declares", () => {
    expect(() => checkBlock('// @errors: 2322\nconst wrong: number = "1";')).not.toThrow();
  });

  test("throws when a declared error does not happen", () => {
    expect(() => checkBlock("// @errors: 2322\nconst right: number = 1;")).toThrow();
  });
});
