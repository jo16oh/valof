import { Result as R } from "@praha/byethrow";
import { expect, test } from "vite-plus/test";

import { FilePath } from "../../../src/lint/files.ts";
import { Parser } from "../../../src/lint/parser.ts";
import { Modules } from "../../../src/lint/scan/bindings.ts";
import { ScanCache } from "../../../src/lint/scan-cache.ts";

const parser = R.unwrap(await Parser.load());
const a = FilePath.seal("/project/a.ts");
const b = FilePath.seal("/project/b.ts");
const c = FilePath.seal("/project/c.ts");

// `a` imports `./c`, which resolves to `c.ts` only while the run includes `c.ts`.
const sources = (text = 'import { x } from "./c";\n'): [FilePath, string][] => [
  [a, text],
  [b, "export {};\n"],
];

test("walks a file again when its text changes, and keeps the others", () => {
  const cache = new ScanCache();
  const modules = Modules.create([a, b]);
  const [first, other] = cache.scan(parser, sources(), modules);
  const [same, untouched] = cache.scan(parser, sources(), modules);
  expect(same).toBe(first);
  expect(untouched).toBe(other);

  const [changed, still] = cache.scan(parser, sources('import { y } from "./c";\n'), modules);
  expect(changed).not.toBe(first);
  expect(Object.keys(changed?.imported ?? {})).toEqual(["y"]);
  expect(still).toBe(other);
});

test.each([
  ["an import", 'import { y } from "./b";\nimport { x } from "./c";\n'],
  ["a re-export", 'export { x } from "./c";\n'],
])("walks a file again when the files in the run change what %s resolves to", (_, text) => {
  const cache = new ScanCache();
  const [before, other] = cache.scan(parser, sources(text), Modules.create([a, b]));
  const [after, untouched] = cache.scan(parser, sources(text), Modules.create([a, b, c]));
  expect(after).not.toBe(before);
  expect(after?.resolved["./c"]).toBe("/project/c.ts");
  expect(untouched).toBe(other);
});

test("keeps every scan when a file no import resolves to joins the run", () => {
  const cache = new ScanCache();
  const d = FilePath.seal("/project/d.ts");
  const [first, other] = cache.scan(parser, sources(), Modules.create([a, b]));
  const [same, untouched] = cache.scan(parser, sources(), Modules.create([a, b, d]));
  expect(same).toBe(first);
  expect(untouched).toBe(other);
});
