// Shared by the types and compat checks of `vp run check-dist`: how to get a `tsc` for a TypeScript
// line, by its alias in `node_modules`.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT, run } from "./repository.ts";

export function version(alias: string): string {
  const manifest = join(ROOT, "node_modules", alias, "package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version;
}

export type Tsc = (args: string[], cwd?: string) => Promise<{ stdout: string }>;

export function tsc(alias: string): Tsc {
  return (args, cwd = ROOT) => run(join(ROOT, "node_modules", alias, "bin/tsc"), args, { cwd });
}
