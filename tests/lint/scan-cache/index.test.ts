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

test("walks a file again only when its text changes", () => {
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

test("walks every file again when the files in the run change, because an import may resolve to another file", () => {
  const cache = new ScanCache();
  const [before] = cache.scan(parser, sources(), Modules.create([a, b]));
  const [after] = cache.scan(parser, sources(), Modules.create([a, b, c]));
  expect(after).not.toBe(before);
  expect(after?.imported["x"]?.module).toBe("/project/c.ts");
});
