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
  const [first, other] = cache.parse(parser, [
    [a, "export const x = 1;\n"],
    [b, "export {};\n"],
  ]);
  const [same, untouched] = cache.parse(parser, [
    [a, "export const x = 1;\n"],
    [b, "export {};\n"],
  ]);
  expect(same).toBe(first);
  expect(untouched).toBe(other);

  const [changed, still] = cache.parse(parser, [
    [a, "export const y = 1;\n"],
    [b, "export {};\n"],
  ]);
  expect(changed).not.toBe(first);
  expect(JSON.stringify(changed?.program)).toContain('"name":"y"');
  expect(still).toBe(other);
});

test("keeps a file apart from another with the same text", () => {
  const cache = new ParseCache();
  const both: [FilePath, string][] = [
    [a, "export {};\n"],
    [b, "export {};\n"],
  ];
  const [, first] = cache.parse(parser, both);
  const [one, two] = cache.parse(parser, both);
  expect(two).toBe(first);
  expect(two).not.toBe(one);
});

test("forgets a file the last call left out", () => {
  const cache = new ParseCache();
  const [kept] = cache.parse(parser, [[a, "export {};\n"]]);
  cache.parse(parser, [[b, "export {};\n"]]);
  expect(cache.parse(parser, [[a, "export {};\n"]])[0]).not.toBe(kept);
});
