import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { withoutParser } from "../support.ts";

const module = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

test("the plugin throws the command's instruction", () => {
  expect(withoutParser(module("plugin.ts")).stdout).toContain("pnpm add -D oxc-parser");
});

test("the plugin throws any other failure to load the parser, rather than reporting nothing", () => {
  expect(withoutParser(module("plugin.ts"), true).stdout).toContain(
    "the parser's binding failed to load",
  );
});
