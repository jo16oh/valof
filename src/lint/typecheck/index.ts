import { createRequire } from "node:module";

import { inProcess } from "./in-process.ts";
import { overLsp } from "./lsp.ts";

/** A name to resolve, as a byte offset into a file. */
export type Query = { file: string; offset: number };

/** A declaration site, in the same terms. */
type Definition = { file: string; offset: number };

/**
 * Resolves every query in one batch, answers positionally.
 *
 * A batch rather than one call per name because the TypeScript 7 backend talks over a pipe:
 * requests are multiplexed by id, so writing all of them and then reading collapses the round
 * trips into one. Measured on 200 names, that is 0.03 ms each against 1.52 ms one at a time.
 *
 * An empty entry means nothing resolved, which callers read as "cannot tell" rather than "not a
 * Val".
 */
export type Resolver = {
  resolveAll: (queries: readonly Query[]) => Promise<Definition[][]>;
  close: () => void;
};

/**
 * The user's own TypeScript, or `undefined`.
 *
 * Resolved from the scanned project, not from this package: valof does not depend on TypeScript.
 * What the linter needs is a tool to run, not a library to share, so there is no single instance
 * to keep and nothing to declare as a peer dependency.
 */
function locate(root: string): { main: string; bin: string; major: number } | undefined {
  try {
    const require = createRequire(`${root}/package.json`);
    const manifest = require.resolve("typescript/package.json");
    const { version } = require(manifest) as { version: string };
    return {
      main: require.resolve("typescript"),
      bin: manifest.replace(/package\.json$/, "bin/tsc"),
      major: Number(version.split(".")[0]),
    };
  } catch {
    return undefined;
  }
}

/**
 * The backend for `files`, or `undefined` when the project has no TypeScript.
 *
 * Absent, the rule that needs it reports nothing rather than guessing. Silence is the safe
 * direction for every rule here.
 */
export function resolver(root: string, files: readonly string[]): Resolver | undefined {
  const found = locate(root);
  if (!found) return undefined;
  return found.major >= 7 ? overLsp(found.bin, root) : inProcess(found.main, root, files);
}
