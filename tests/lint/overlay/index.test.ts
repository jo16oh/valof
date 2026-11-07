import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import { lint } from "../../../src/lint/index.ts";
import { UnusedMember } from "../support.ts";

// What an editor sends: the buffer being typed in, which disk does not have yet.

const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const dead = (name: string): string =>
  `const ${name} = Val.companion<${name}>().impl(() => ({\n  shout: (v) => v.toUpperCase(),\n})).build();\n`;

test("scans a file the buffer is the only copy of", async () => {
  const findings = await lint([], { overlay: new Map([[at("unsaved.ts"), dead("Id")]]) });
  expect(findings.map(({ kind }) => kind)).toEqual([UnusedMember.kind]);
});
