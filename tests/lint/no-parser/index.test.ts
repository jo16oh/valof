import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { withoutParser } from "../support.ts";

const module = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

test("lint() rejects with MissingParserError, carrying the install line", () => {
  expect(withoutParser(module("lint.ts")).stdout).toBe(
    "MissingParserError valof-lint needs oxc-parser, which valof does not install for you.\n" +
      "  pnpm add -D oxc-parser\n",
  );
});

test("the plugin throws the command's instruction", () => {
  expect(withoutParser(module("plugin.ts")).stdout).toContain("pnpm add -D oxc-parser");
});

test("lint() lets any other failure to load the parser through as it is", () => {
  expect(withoutParser(module("lint.ts"), true).stdout).toBe(
    "Error the parser's binding failed to load\n",
  );
});

test("the plugin throws any other failure to load the parser, rather than reporting nothing", () => {
  expect(withoutParser(module("plugin.ts"), true).stdout).toContain(
    "the parser's binding failed to load",
  );
});
