import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { Options, lint } from "../../../src/lint/index.ts";
import { UnusedMember } from "../support.ts";

// What an editor sends: the buffer being typed in, which disk does not have yet.

function at(name: string): string {
  return fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
}

function dead(name: string): string {
  return `const ${name} = Val.companion<${name}>().impl(() => ({\n  shout: (v) => v.toUpperCase(),\n})).build();\n`;
}

test("scans a file the buffer is the only copy of", async () => {
  const findings = await lint([], Options.create({ overlay: [[at("unsaved.ts"), dead("Id")]] }));
  expect(findings.map(({ kind }) => kind)).toEqual([UnusedMember.kind]);
});

const SAVED = at("saved.ts");

test.each([
  ["a relative path, the buffer by an absolute one", relative(process.cwd(), SAVED), SAVED],
  ["an absolute path, the buffer by a relative one", SAVED, relative(process.cwd(), SAVED)],
])("reads the buffer over a file listed by %s", async (_, listed, key) => {
  const findings = await lint([listed], Options.create({ overlay: [[key, dead("Id")]] }));
  expect(findings.map(({ kind }) => kind)).toEqual([UnusedMember.kind]);
});

test("reads an empty buffer as the file, not what disk holds", async () => {
  // On disk the file has a member nothing reads. The editor has it emptied, unsaved.
  const emptied = at("emptied.ts");
  expect(await lint([emptied])).not.toEqual([]);
  expect(await lint([emptied], Options.create({ overlay: [[emptied, ""]] }))).toEqual([]);
});
