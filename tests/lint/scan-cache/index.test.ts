import { Result as R } from "@praha/byethrow";
import { expect, test } from "vite-plus/test";

import { FilePath } from "../../../src/lint/files.ts";
import { Parser } from "../../../src/lint/parser.ts";
import { Modules } from "../../../src/lint/scan/bindings.ts";
import { ScanCache } from "../../../src/lint/scan-cache.ts";

const parser = R.unwrap(await Parser.load());
const A = FilePath.seal("/project/a.ts");
const B = FilePath.seal("/project/b.ts");
const C = FilePath.seal("/project/c.ts");

/** How many times any cache has asked for the parser, across the tests. */
let loads = 0;

/** The scans `cache` returns for `files`, counting in {@link loads} each time it asks for the parser. */
const scanned = async (
  cache: ScanCache,
  files: readonly (readonly [FilePath, string])[],
  modules: Modules,
) =>
  R.unwrap(
    await cache.scan(
      async () => {
        loads++;
        return R.succeed(parser);
      },
      files,
      modules,
    ),
  );

// `a` imports `./c`, which resolves to `c.ts` only while the run includes `c.ts`.
const sources = (text = 'import { x } from "./c";\n'): [FilePath, string][] => [
  [A, text],
  [B, "export {};\n"],
];

test("walks a file again when its text changes, and keeps the others", async () => {
  const cache = new ScanCache();
  const modules = Modules.create([A, B]);
  const [first, other] = await scanned(cache, sources(), modules);
  const [same, untouched] = await scanned(cache, sources(), modules);
  expect(same).toBe(first);
  expect(untouched).toBe(other);

  const [changed, still] = await scanned(cache, sources('import { y } from "./c";\n'), modules);
  expect(changed).not.toBe(first);
  expect(Object.keys(changed?.imported ?? {})).toEqual(["y"]);
  expect(still).toBe(other);
});

test.each([
  ["an import", 'import { y } from "./b";\nimport { x } from "./c";\n'],
  ["a re-export", 'export { x } from "./c";\n'],
])("walks a file again when the files in the run change what %s resolves to", async (_, text) => {
  const cache = new ScanCache();
  const [before, other] = await scanned(cache, sources(text), Modules.create([A, B]));
  const [after, untouched] = await scanned(cache, sources(text), Modules.create([A, B, C]));
  expect(after).not.toBe(before);
  expect(after?.resolved["./c"]).toBe("/project/c.ts");
  expect(untouched).toBe(other);
});

test("keeps every scan when a file no import resolves to joins the run", async () => {
  const cache = new ScanCache();
  const d = FilePath.seal("/project/d.ts");
  const [first, other] = await scanned(cache, sources(), Modules.create([A, B]));
  const [same, untouched] = await scanned(cache, sources(), Modules.create([A, B, d]));
  expect(same).toBe(first);
  expect(untouched).toBe(other);
});

test("loads the parser only when a file has to be walked", async () => {
  const cache = new ScanCache();
  const before = loads;
  await scanned(cache, sources(), Modules.create([A, B]));
  expect(loads).toBe(before + 1);
  await scanned(cache, sources(), Modules.create([A, B]));
  expect(loads).toBe(before + 1);
});
