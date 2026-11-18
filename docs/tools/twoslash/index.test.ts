import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vite-plus/test";

import { docBlocks, markdownBlocks } from "./index.ts";
import { Twoslash } from "./twoslash.ts";

const CHAPTERS = fileURLToPath(new URL("../../src", import.meta.url));
const README = fileURLToPath(new URL("../../../README.md", import.meta.url));

let twoslash: Twoslash;

beforeAll(() => {
  twoslash = new Twoslash();
});

describe("the book's TypeScript blocks", () => {
  for (const block of docBlocks(CHAPTERS)) {
    test.skipIf(block.ignored)(block.name, () => {
      twoslash.check(block.code);
    });
  }
});

describe("the README's TypeScript blocks", () => {
  for (const block of markdownBlocks(readFileSync(README, "utf8"), "README.md")) {
    test.skipIf(block.ignored)(block.name, () => {
      twoslash.check(block.code);
    });
  }
});

describe("Twoslash.check", () => {
  // Without these two, the suite above passes whether or not anything is being checked.
  test("throws for a block that does not typecheck", () => {
    expect(() => twoslash.check('const wrong: number = "1";')).toThrow("2322");
  });

  test("checks with the strictness of the root tsconfig.json", () => {
    expect(() => twoslash.check("const optional: { a?: number } = { a: undefined };")).toThrow(
      "2375",
    );
    expect(() => twoslash.check("const first: number = [1][0];")).toThrow("2322");
  });

  test("accepts an error the block declares", () => {
    expect(() => twoslash.check('// @errors: 2322\nconst wrong: number = "1";')).not.toThrow();
  });

  test("throws when a declared error does not happen", () => {
    expect(() => twoslash.check("// @errors: 2322\nconst right: number = 1;")).toThrow(
      "declared as errors, but nothing went wrong: 2322",
    );
  });
});
