import { globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { Val } from "../index.ts";

/** A file in a run, spelled as it was given to the run, which is how a finding prints it. */
export type FilePath = Val<"FilePath", string>;
export const FilePath = Val.companion<FilePath>()
  .impl(() => ({
    /** Whether a finding in the file is reported. `targets` is `null` when every file is. */
    isTarget: (file, targets: Readonly<Record<string, true>> | null): boolean =>
      targets === null || Object.hasOwn(targets, resolve(file)),
    /** The file's source: the overlay's, keyed by resolved path, or else what disk holds. */
    read: (file, overlay: Readonly<Record<string, string>>): string => {
      const key = resolve(file);
      return Object.hasOwn(overlay, key) ? (overlay[key] as string) : readFileSync(file, "utf8");
    },
  }))
  .build();

/** What a directory holds, for a caller who names one instead of writing the glob out. */
const UNDER = "**/*.{ts,tsx,mts,cts}";

export const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The files one path stands for, a directory or a glob alike.
 *
 * A directory includes the TypeScript files under it, never what its dependencies installed: a
 * project given as `.` would otherwise walk `node_modules`.
 */
export const expand = (path: string): string[] =>
  globSync(isDirectory(path) ? `${path}/${UNDER}` : path, {
    exclude: (found) => found.split(/[\\/]/).includes("node_modules"),
  });
