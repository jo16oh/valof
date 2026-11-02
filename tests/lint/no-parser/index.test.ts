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
