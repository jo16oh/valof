import { globSync, statSync } from "node:fs";

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
 * A directory brings the TypeScript under it, never what its dependencies installed: a project
 * given as `.` would otherwise walk `node_modules`.
 */
export const expand = (path: string): string[] =>
  globSync(isDirectory(path) ? `${path}/${UNDER}` : path, {
    exclude: (found) => found.split(/[\\/]/).includes("node_modules"),
  });
