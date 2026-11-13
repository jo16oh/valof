import { Result as R } from "@praha/byethrow";
import { beforeAll, expect, test } from "vite-plus/test";

import { FilePath } from "./files.ts";
import { ParseCache } from "./parse-cache.ts";
import { Parser } from "./parser.ts";

let parser: Parser;

beforeAll(async () => {
  parser = R.unwrap(await Parser.load());
});
const A = FilePath.seal("/project/a.ts");
const B = FilePath.seal("/project/b.ts");

test("parses a file again only once its text changes", () => {
  const cache = new ParseCache();
  const first = cache.tree(parser, A, "export const x = 1;\n");
  const other = cache.tree(parser, B, "export {};\n");
  expect(cache.tree(parser, A, "export const x = 1;\n")).toBe(first);

  const changed = cache.tree(parser, A, "export const y = 1;\n");
  expect(changed).not.toBe(first);
  expect(JSON.stringify(changed.program)).toContain('"name":"y"');
  expect(cache.tree(parser, B, "export {};\n")).toBe(other);
});

test("keeps a file apart from another with the same text", () => {
  const cache = new ParseCache();
  const one = cache.tree(parser, A, "export {};\n");
  const two = cache.tree(parser, B, "export {};\n");
  expect(cache.tree(parser, B, "export {};\n")).toBe(two);
  expect(two).not.toBe(one);
});

test("forgets every file but those it is told to keep", () => {
  const cache = new ParseCache();
  const dropped = cache.tree(parser, A, "export {};\n");
  const kept = cache.tree(parser, B, "export {};\n");
  cache.keep([B]);
  expect(cache.tree(parser, A, "export {};\n")).not.toBe(dropped);
  expect(cache.tree(parser, B, "export {};\n")).toBe(kept);
});
