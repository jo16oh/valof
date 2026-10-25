// `#valof`, which the scripts import, resolves to a build of the commit `package.json` pins
// under `valof-pinned-for-scripts-commit`. A half-written `src` then cannot break the scripts.
//
//   vp run pin-valof          builds the pinned commit; `prepare` runs this after `vp install`
//   vp run pin-valof <rev>    pins <rev>, and builds it
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { root } from "../shared/typescript-lines.ts";

const run = promisify(execFile);

const field = "valof-pinned-for-scripts-commit";

/** What `devDependencies.valof-pinned-for-scripts` links to. Inside `node_modules`, so tsc skips it. */
const target = join(root, "node_modules/.valof-pinned-for-scripts");
const stamp = join(target, ".commit");

/**
 * What `dist` is built from. `package.json` stays out: it holds the pin, and a release bumps its
 * version. Valof has no runtime dependency, so nothing else in it reaches `dist`.
 */
const inputs = ["src", "vite.config.ts", "tsconfig.json", "tsconfig.build.json"];

export async function pinned(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    [field]?: string;
  };
  const commit = manifest[field];
  if (commit === undefined) throw new Error(`package.json has no "${field}"`);
  return commit;
}

/** Whether the working tree builds the `dist` that `commit` builds. */
export async function matches(commit: string, cwd = root): Promise<boolean> {
  try {
    await run("git", ["diff", "--quiet", commit, "--", ...inputs], { cwd });
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return false;
    throw error;
  }
}

/** Builds `commit` into {@link target}, unless it is already there. */
export async function build(commit: string): Promise<void> {
  const built = await readFile(stamp, "utf8").catch(() => undefined);
  if (built === commit) return;

  await fetched(commit);
  const tree = await mkdtemp(join(tmpdir(), "valof-pinned-"));
  try {
    const archive = join(tree, "tree.tar");
    await run("git", ["archive", "--output", archive, commit], { cwd: root });
    await run("tar", ["-xf", archive, "-C", tree]);
    // The toolchain of the working tree builds it. Only the source is the pinned one.
    await symlink(join(root, "node_modules"), join(tree, "node_modules"));
    await run(join(root, "node_modules/.bin/vp"), ["run", "build"], { cwd: tree });

    await rm(target, { recursive: true, force: true });
    await mkdir(target);
    await cp(join(tree, "dist"), join(target, "dist"), { recursive: true });
    await cp(join(tree, "package.json"), join(target, "package.json"));
    await writeFile(stamp, commit);
  } finally {
    await rm(tree, { recursive: true, force: true });
  }
  console.log(`valof ${commit.slice(0, 7)} built for #valof`);
}

// Only when run as a command. ts-compatibility and the tests import this file for its functions.
if (import.meta.main) {
  const [rev] = process.argv.slice(2).filter((arg) => arg !== "--");
  if (rev === undefined) {
    await build(await pinned());
  } else {
    const { stdout } = await run("git", ["rev-parse", "--verify", `${rev}^{commit}`], {
      cwd: root,
    });
    const commit = stdout.trim();
    await build(commit);
    await pin(commit);
  }
}

// CI checks out one commit, so the pinned one is fetched on demand.
async function fetched(commit: string): Promise<void> {
  try {
    await run("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root });
  } catch {
    await run("git", ["fetch", "--quiet", "--depth=1", "origin", commit], { cwd: root });
  }
}

// Rewrites the one line, so the rest of `package.json` keeps its formatting.
async function pin(commit: string): Promise<void> {
  const file = join(root, "package.json");
  const text = await readFile(file, "utf8");
  const line = new RegExp(`("${field}": )"[0-9a-f]*"`);
  if (!line.test(text)) throw new Error(`package.json has no "${field}"`);
  await writeFile(file, text.replace(line, `$1"${commit}"`));
  console.log(`pinned valof to ${commit}`);
}
