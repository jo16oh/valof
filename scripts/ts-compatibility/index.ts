import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const project = "scripts/ts-compatibility/tsconfig.json";

/**
 * The floor the README claims. Its line is finished, so the number does not move.
 *
 * A line's last release is where its semantics settled, and supporting one from there avoids the
 * edge cases of the versions in between. Older ones typecheck as it stands; they are a policy
 * choice, not a capability limit (notes §10.1).
 */
const floor = "5.9.3";

const registry = "https://registry.npmjs.org/typescript";

type Semver = [number, number, number];

const compare = (a: Semver, b: Semver): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The floor, plus the newest stable release of every line above it. Read from the registry rather
 * than listed here: a line still shipping releases goes stale the moment it is written down, and a
 * new major would wait for someone to notice it. What stays a decision is the floor.
 */
async function supported(): Promise<string[]> {
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

const versions = await supported();

await run(join(root, "node_modules/.bin/vp"), ["pack"], { cwd: root });

const dir = await mkdtemp(join(tmpdir(), "valof-ts-"));
const failed: string[] = [];

try {
  for (const version of versions) {
    // Installed in a temp directory of its own: the repo is on pnpm, and nothing here is a
    // dependency of the package.
    await run("npm", ["install", "--silent", "--no-audit", "--no-fund", `typescript@${version}`], {
      cwd: dir,
    });

    try {
      await run(join(dir, "node_modules/.bin/tsc"), ["-p", project], { cwd: root });
      console.log(`  typescript@${version}  pass`);
    } catch (error) {
      failed.push(version);
      console.log(`  typescript@${version}  fail`);
      console.log(`${(error as { stdout?: string }).stdout ?? String(error)}`);
    }
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log();

if (failed.length > 0) {
  console.error(`the declarations do not typecheck on ${failed.join(", ")}`);
  process.exit(1);
}
