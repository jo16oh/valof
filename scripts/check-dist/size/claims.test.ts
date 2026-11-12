import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Result as R } from "@praha/byethrow";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { claims, type ClaimCountError, type StaleClaimError } from "./claims.ts";

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
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const read = (file: string): Promise<string> => readFile(join(directory, file), "utf8");
const message = (result: R.Result<void, ClaimCountError | StaleClaimError>): string | undefined =>
  R.isFailure(result) ? result.error.message : undefined;

describe("claims", () => {
  test("reads a claim the formatter wrapped across lines", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("965 B\n  gzipped"));
    expect(message(await claims(965, { release: false, write: false }, root))).toBeUndefined();
  });

  test("fails on a stale claim, naming the file and both sizes", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("9 B gzipped"));
    expect(message(await claims(965, { release: false, write: false }, root))).toBe(
      "stale claim: docs/src/introduction.md says 9 B gzipped, measured 965 B gzipped. Rerun with --write.",
    );
  });

  test("rewrites a stale claim with --write", async () => {
    await writeFile(join(directory, "docs/src/introduction.md"), intro("9 B gzipped"));
    expect(message(await claims(1100, { release: false, write: true }, root))).toBeUndefined();
    expect(await read("docs/src/introduction.md")).toBe(intro("1.07 kB gzipped"));
  });

  test("reads the README and the package description only for a release", async () => {
    await writeFile(join(directory, "package.json"), manifest("9 B gzipped"));
    expect(message(await claims(965, { release: false, write: false }, root))).toBeUndefined();
    expect(message(await claims(965, { release: true, write: false }, root))).toBe(
      "stale claim: package.json says 9 B gzipped, measured 965 B gzipped. Rerun with --write --release.",
    );
    await claims(1100, { release: true, write: true }, root);
    expect(await read("package.json")).toBe(manifest("1.07 kB gzipped"));
    expect(await read("README.md")).toBe(intro("1.07 kB gzipped"));
  });

  test.each([
    { text: "no claim\n", found: 0 },
    { text: intro("965 B gzipped").repeat(2), found: 2 },
  ])("fails on a file that states the size $found times", async ({ text, found }) => {
    await writeFile(join(directory, "docs/src/introduction.md"), text);
    expect(message(await claims(965, { release: false, write: false }, root))).toBe(
      `docs/src/introduction.md: expected one bundle-size claim, found ${found}`,
    );
  });
});
