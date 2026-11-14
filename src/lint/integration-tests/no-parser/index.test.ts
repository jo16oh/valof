import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { cliWithoutParser, withoutParser } from "../support.ts";

function module(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

test("the plugin throws the command's instruction", () => {
  const command = cliWithoutParser("src/lint/integration-tests/command/fixtures").stderr;
  expect(withoutParser(module("plugin.ts")).stdout).toBe(`Error ${command}\n`);
});

test("the plugin throws any other failure to load the parser, rather than reporting nothing", () => {
  expect(withoutParser(module("plugin.ts"), true).stdout).toBe(
    "Error valof-lint: Error: the parser's binding failed to load\n",
  );
});
