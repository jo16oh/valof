import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Result as R } from "@praha/byethrow";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";

import { SourceExports } from "./round-trip.ts";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "valof-round-trip-test-"));
});

afterEach(() => rm(directory, { recursive: true, force: true }));

test("reads each export, and how many type parameters a type takes", async () => {
  const file = await module("export const a = 1;\nexport type B<T> = T[];\n");
  const result = SourceExports.read(directory, [file]);
  expect(R.isSuccess(result) && result.value.modules[0]!.symbols).toEqual([
    { name: "a", value: true },
    { name: "B", value: false, parameters: 1 },
  ]);
});

test.each([
  [
    "a namespace that holds only types",
    "export namespace N {\n  export type T = 1;\n}\n",
    "cannot compare N",
  ],
  [
    "a type whose parameters have constraints",
    "export type C<T extends string> = T;\n",
    "cannot compare C, whose type parameters have constraints",
  ],
])("fails on %s, which the round trip cannot compare", async (_, source, message) => {
  const file = await module(source);
  const result = SourceExports.read(directory, [file]);
  expect(R.isFailure(result) && result.error.message).toBe(`${file}: ${message}`);
});

test("fails on a directory with no `tsconfig.json`", () => {
  const result = SourceExports.read(directory, []);
  expect(R.isFailure(result) && result.error.message).toContain("tsconfig.json");
});

async function module(source: string): Promise<string> {
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { strict: true } }),
  );
  const file = join(directory, "module.ts");
  await writeFile(file, source);
  return file;
}
