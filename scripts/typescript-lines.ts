// Shared by `vp run ts-compatibility` and `vp run type-perf`: which TypeScript releases to run,
// and how to get a `tsc` for each one.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const run = promisify(execFile);

export const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * The floor the README claims, the line above it, and the current one, each installed under an
 * alias. Read from `node_modules`, so a new major enters this check when someone adds its alias.
 *
 * A line's last release is where its semantics settled, and supporting one from there avoids the
 * edge cases of the versions in between (notes §10.1).
 */
export const aliases = ["typescript-5", "typescript-6", "typescript"];

/** The floor, which is the alias `vp run type-perf` measures on. */
export const floor = aliases[0]!;

export function version(alias: string): string {
  const manifest = join(root, "node_modules", alias, "package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

export type Tsc = (args: string[], cwd?: string) => Promise<{ stdout: string }>;

export const tsc =
  (alias: string): Tsc =>
  (args, cwd = root) =>
    run(join(root, "node_modules", alias, "bin/tsc"), args, { cwd });

/** Builds `dist`, which is what both scripts measure: the consumer's entry, not `src`. */
export async function pack(): Promise<void> {
  await run(join(root, "node_modules/.bin/vp"), ["pack"], { cwd: root });
}
