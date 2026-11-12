import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Result as R } from "@praha/byethrow";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { Claims } from "./claims.ts";

let root: URL;
let directory: string;

const intro = (size: string): string =>
  `- Starts from <!-- valof-minimal-bundle-size -->${size}<!-- /valof-minimal-bundle-size -->.\n`;
const manifest = (size: string): string => `{ "description": "Starts from ${size}." }\n`;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "valof-claims-test-"));
  root = pathToFileURL(`${directory}/`);
  await mkdir(join(directory, "docs/src"), { recursive: true });
  await writeFile(join(directory, "docs/src/introduction.md"), intro("965 B gzipped"));
  await writeFile(join(directory, "README.md"), intro("965 B gzipped"));
  await writeFile(join(directory, "package.json"), manifest("965 B gzipped"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const read = (file: string): Promise<string> => readFile(join(directory, file), "utf8");

// Reads, rewrites with `write`, and judges, as the size check does. The verdict's message, if any.
async function check(
  gzip: number,
  { release, write }: { release: boolean; write: boolean },
): Promise<string | undefined> {
  const claims = await Claims.read(gzip, release, root);
  if (R.isFailure(claims)) return claims.error.message;

  if (write) await Claims.rewrite(claims.value, root);
  const verdict = Claims.verdict(claims.value, { release, write });

  return R.isFailure(verdict) ? verdict.error.message : undefined;
}

describe("Claims", () => {
  test("reads a claim the formatter wrapped across lines", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("965 B\n  gzipped"));
    expect(await check(965, { release: false, write: false })).toBeUndefined();
  });

  test("reads only the marked claim in Markdown, even beside a package description", async () => {
    await writeFile(
      join(directory, "docs/src/introduction.md"),
      `${intro("965 B gzipped")}\n\`\`\`json\n${manifest("9 B gzipped")}\`\`\`\n`,
    );
    expect(await check(965, { release: false, write: false })).toBeUndefined();
  });

  test("fails on a stale claim, naming the file and both sizes", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("9 B gzipped"));
    expect(await check(965, { release: false, write: false })).toBe(
      "stale claim: docs/src/introduction.md says 9 B gzipped, measured 965 B gzipped. Rerun with --write.",
    );
  });

  test("rewrites a stale claim with --write", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("9 B gzipped"));
    expect(await check(1100, { release: false, write: true })).toBeUndefined();
    expect(await read("docs/src/introduction.md")).toBe(intro("1.07 kB gzipped"));
  });

  test("reads the README and the package description only for a release", async () => {
    await writeFile(join(directory, "package.json"), manifest("9 B gzipped"));
    expect(await check(965, { release: false, write: false })).toBeUndefined();
    expect(await check(965, { release: true, write: false })).toBe(
      "stale claim: package.json says 9 B gzipped, measured 965 B gzipped. Rerun with --write --release.",
    );
    await check(1100, { release: true, write: true });
    expect(await read("package.json")).toBe(manifest("1.07 kB gzipped"));
    expect(await read("README.md")).toBe(intro("1.07 kB gzipped"));
  });

  test("prints each claim's state, and what --write rewrote", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("9 B gzipped"));
    const claims = R.unwrap(await Claims.read(965, true, root));
    expect(Claims.render(claims, false)).toBe(
      [
        "claims  965 B gzipped",
        "  docs/src/introduction.md  stale: 9 B gzipped",
        "  README.md                 ok",
        "  package.json              ok",
      ].join("\n"),
    );
    expect(Claims.render(claims, true)).toContain(
      "  docs/src/introduction.md  updated from 9 B gzipped",
    );
  });

  test.each([
    { text: "no claim\n", found: 0 },
    { text: intro("965 B gzipped").repeat(2), found: 2 },
  ])("fails on a file that states the size $found times", async ({ text, found }) => {
    await writeFile(join(directory, "docs/src/introduction.md"), text);
    expect(await check(965, { release: false, write: false })).toBe(
      `docs/src/introduction.md: expected one bundle-size claim, found ${found}`,
    );
  });
});
