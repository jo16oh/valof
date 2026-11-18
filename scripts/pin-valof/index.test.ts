import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { build, matches } from "./index.ts";

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
  test.each([
    ["package.json", '{ "version": "1.0.0" }\n'],
    ["vite.config.ts", "export default {};\n"],
  ])("holds when only `%s` changed, which the runtime is not built from", async (file, text) => {
    await writeFile(join(repo, file), text);
    await commit();
    expect(await matches(pin, repo)).toBe(true);
  });

  test("fails once `src` differs", async () => {
    await writeFile(join(repo, "src/index.ts"), "export const a = 2;\n");
    await commit();
    expect(await matches(pin, repo)).toBe(false);
  });

  test.each(["tsconfig.json", "tsconfig.build.json"])("fails once `%s` differs", async (file) => {
    await writeFile(join(repo, file), "{}\n");
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

describe("build", () => {
  let head: string;
  let out: string;

  beforeEach(async () => {
    // `vp run build` would run this script, so only an unreadable config fails it.
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ scripts: { build: "tsc -p tsconfig.build.json" } }),
    );
    await writeFile(join(repo, "vite.config.ts"), 'throw new Error("unreadable");\n');
    await writeFile(
      join(repo, "tsconfig.build.json"),
      JSON.stringify({
        compilerOptions: { rootDir: "src", outDir: "dist" },
        files: ["src/index.ts"],
      }),
    );
    head = await commit();
    out = join(repo, "out");
  });

  test("builds the runtime with tsc, whatever the pinned commit's `vite.config.ts` holds", async () => {
    await build(head, repo, out);

    expect(await readFile(join(out, "dist/index.js"), "utf8")).toContain("export const a = 1");
    expect(await readFile(join(out, "package.json"), "utf8")).toContain("tsc -p");
  });

  test("skips a commit already built, and replaces it for another", async () => {
    await build(head, repo, out);
    await writeFile(join(out, "kept"), "");
    await build(head, repo, out);
    expect(await readdir(out)).toContain("kept");

    await writeFile(join(repo, "src/index.ts"), "export const a = 2;\n");
    await build(await commit(), repo, out);
    expect(await readdir(out)).not.toContain("kept");
    expect(await readFile(join(out, "dist/index.js"), "utf8")).toContain("export const a = 2");
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
