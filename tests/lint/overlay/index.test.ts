import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { lint, resolver, type Resolver } from "../../../src/lint/index.ts";
import { fixtures, root } from "../support.ts";

// What an editor sends: the buffer being typed in, which disk does not have yet.

const { all, lint: over } = fixtures(import.meta.url);
const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

const dead = (name: string): string =>
  `const ${name} = Val.sealer<${name}>().impl({\n  shout: (v) => v.toUpperCase(),\n});\n`;

test("walks the buffer in place of the file", async () => {
  expect(await over("buffer")).toEqual([]);
  const overlay = new Map([[at("buffer.ts"), dead("User")]]);
  expect(await over("buffer", { overlay })).toEqual([
    "buffer.ts:2:3  unused-member  User.shout is never read",
  ]);
});

test("scans a file the buffer is the only copy of", async () => {
  const findings = await lint([], { overlay: new Map([[at("unsaved.ts"), dead("Id")]]) });
  expect(findings.map(({ kind, message }) => `${kind}  ${message}`)).toEqual([
    "unused-member  Id.shout is never read",
  ]);
});

// The one rule that resolves names, so the only one an overlay has to reach the type checker for.
describe("a resolver held across runs", () => {
  let types: Resolver | undefined;
  beforeAll(() => {
    types = resolver(root, all());
  });
  afterAll(() => types?.close());

  // Shifted rather than rewritten: the finding moves with the buffer only where the checker
  // resolves `Money` at the buffer's own positions, which is what the disk copy cannot answer.
  const disk = readFileSync(at("types/order.ts"), "utf8");
  const shifted = (lines: number): Map<string, string> =>
    new Map([[at("types/order.ts"), `${"//\n".repeat(lines)}${disk}`]]);
  const holding = (line: number): string[] => [
    `types/order.ts:${line}:22  structural-equals  Order.total holds Money, which has its own equals`,
  ];

  test("follows the buffer as it moves, and lets go of it", async () => {
    expect(await over("types", { types })).toEqual(holding(6));
    expect(await over("types", { types, overlay: shifted(1) })).toEqual(holding(7));
    expect(await over("types", { types, overlay: shifted(2) })).toEqual(holding(8));
    expect(await over("types", { types })).toEqual(holding(6));
  });
});
