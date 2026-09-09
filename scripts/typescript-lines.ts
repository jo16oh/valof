// Shared by `vp run ts-compatibility` and `vp run type-perf`: which TypeScript releases to run,
// and how to get a `tsc` for each one.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const run = promisify(execFile);

export const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * The floor the README claims. Its line is finished, so the number does not move.
 *
 * A line's last release is where its semantics settled, and supporting one from there avoids the
 * edge cases of the versions in between. Older ones typecheck as it stands; they are a policy
 * choice, not a capability limit (notes §10.1).
 */
export const floor = "5.9.3";

const registry = "https://registry.npmjs.org/typescript";

type Semver = [number, number, number];

const compare = (a: Semver, b: Semver): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The floor, plus the newest stable release of every line above it. Read from the registry rather
 * than listed here: a line still shipping releases goes stale the moment it is written down, and a
 * new major would wait for someone to notice it. What stays a decision is the floor.
 */
export async function supported(): Promise<string[]> {
  const response = await fetch(registry);
  if (!response.ok) throw new Error(`${registry}: ${response.status} ${response.statusText}`);

  const { versions } = (await response.json()) as { versions: Record<string, unknown> };
  const heads = new Map<number, Semver>();

  for (const version of Object.keys(versions)) {
    if (version.includes("-")) continue; // a prerelease is not a line's head
    const parsed = version.split(".").map(Number) as Semver;
    if (parsed[0] <= Number(floor.split(".")[0])) continue;
    const head = heads.get(parsed[0]);
    if (!head || compare(head, parsed) < 0) heads.set(parsed[0], parsed);
  }

  return [floor, ...[...heads.values()].sort(compare).map((head) => head.join("."))];
}

/** Builds `dist`, which is what both scripts measure: the consumer's entry, not `src`. */
export async function pack(): Promise<void> {
  await run(join(root, "node_modules/.bin/vp"), ["pack"], { cwd: root });
}

/**
 * Installs each version in turn and hands over the path to its `tsc`.
 *
 * A temp directory of its own: the repo is on pnpm, and none of these is a dependency of the
 * package.
 */
export async function forEachVersion(
  versions: string[],
  body: (tsc: string, version: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "valof-ts-"));
  try {
    for (const version of versions) {
      await run(
        "npm",
        ["install", "--silent", "--no-audit", "--no-fund", `typescript@${version}`],
        {
          cwd: dir,
        },
      );
      await body(join(dir, "node_modules/.bin/tsc"), version);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
