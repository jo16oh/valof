import { Result as R } from "@praha/byethrow";
import { expect, test } from "vite-plus/test";

import { FilePath } from "../../../src/lint/files.ts";
import { ParseCache } from "../../../src/lint/parse-cache.ts";
import { Parser } from "../../../src/lint/parser.ts";

const parser = R.unwrap(await Parser.load());
const a = FilePath.seal("/project/a.ts");
const b = FilePath.seal("/project/b.ts");

test("parses a file again only once its text changes", () => {
  const cache = new ParseCache();
  const first = cache.tree(parser, a, "export const x = 1;\n");
  const other = cache.tree(parser, b, "export {};\n");
  expect(cache.tree(parser, a, "export const x = 1;\n")).toBe(first);

  const changed = cache.tree(parser, a, "export const y = 1;\n");
  expect(changed).not.toBe(first);
  expect(JSON.stringify(changed.program)).toContain('"name":"y"');
  expect(cache.tree(parser, b, "export {};\n")).toBe(other);
});

test("keeps a file apart from another with the same text", () => {
  const cache = new ParseCache();
  const one = cache.tree(parser, a, "export {};\n");
  const two = cache.tree(parser, b, "export {};\n");
  expect(cache.tree(parser, b, "export {};\n")).toBe(two);
  expect(two).not.toBe(one);
});

test("forgets every file but those it is told to keep", () => {
  const cache = new ParseCache();
  const dropped = cache.tree(parser, a, "export {};\n");
  const kept = cache.tree(parser, b, "export {};\n");
  cache.keep([b]);
  expect(cache.tree(parser, a, "export {};\n")).not.toBe(dropped);
  expect(cache.tree(parser, b, "export {};\n")).toBe(kept);
});
