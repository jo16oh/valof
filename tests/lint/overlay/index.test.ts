import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { lint } from "../../../src/lint/index.ts";
import { UnusedMember, fixtures } from "../support.ts";

// What an editor sends: the buffer being typed in, which disk does not have yet.

const { lint: over } = fixtures(import.meta.url);
const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const dead = (name: string): string =>
  `const ${name} = Val.sealer<${name}>().impl({\n  shout: (v) => v.toUpperCase(),\n});\n`;

test("walks the buffer in place of the file", async () => {
  expect(await over("buffer")).toEqual([]);
  const overlay = new Map([[at("buffer.ts"), dead("User")]]);
  expect(await over("buffer", { overlay })).toEqual([{ rule: UnusedMember, at: "buffer.ts:2:3" }]);
});

test("scans a file the buffer is the only copy of", async () => {
  const findings = await lint([], { overlay: new Map([[at("unsaved.ts"), dead("Id")]]) });
  expect(findings.map(({ kind }) => kind)).toEqual([UnusedMember.kind]);
});
