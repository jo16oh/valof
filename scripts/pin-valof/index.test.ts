import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { matches } from "./index.ts";

const run = promisify(execFile);

let repo: string;
let pin: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "valof-pin-test-"));
  await git("init", "--quiet");
  await mkdir(join(repo, "src"));
  await writeFile(join(repo, "src/index.ts"), "export const a = 1;\n");
  await writeFile(join(repo, "package.json"), "{}\n");
  pin = await commit();
});

afterEach(() => rm(repo, { recursive: true, force: true }));

describe("matches", () => {
  test("holds when nothing that builds `dist` changed, `package.json` included", async () => {
    await writeFile(join(repo, "README.md"), "docs\n");
    await writeFile(join(repo, "package.json"), '{ "version": "1.0.0" }\n');
    await commit();
    expect(await matches(pin, repo)).toBe(true);
  });

  test("fails once `src` differs", async () => {
    await writeFile(join(repo, "src/index.ts"), "export const a = 2;\n");
    await commit();
    expect(await matches(pin, repo)).toBe(false);
  });

  test("fails once `tsconfig.json` differs, which `tsconfig.build.json` extends", async () => {
    await writeFile(join(repo, "tsconfig.json"), "{}\n");
    await commit();
    expect(await matches(pin, repo)).toBe(false);
  });

  test("compares the working tree, which is what `dist` is built from", async () => {
    await writeFile(join(repo, "src/index.ts"), "export const a = 2;\n");
    expect(await matches(pin, repo)).toBe(false);
  });

  test("throws when the pinned commit is not in the repository", async () => {
    await expect(matches("0".repeat(40), repo)).rejects.toThrow(/bad object|unknown revision/);
  });
});

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repo });
  return stdout.trim();
}

async function commit(): Promise<string> {
  await git("add", "--all");
  await git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "c");
  return git("rev-parse", "HEAD");
}
