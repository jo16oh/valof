import { globSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Val } from "../index.ts";
import { pipe } from "../shared/pipe/index.ts";

/** What a directory holds, for a caller who names one instead of writing the glob out. */
const UNDER = "**/*.{ts,tsx,mts,cts}";

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
      return (Object.hasOwn(overlay, key) ? overlay[key] : undefined) ?? readFileSync(file, "utf8");
    },
  }))
  .build();

/** A path or a glob, as the user wrote it. */
export type Path = Val<"Path", string>;
export const Path = Val.companion<Path>()
  .impl(() => ({
    /** Whether it names a directory on disk. */
    isDirectory: (path): boolean => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    /**
     * The files it stands for, a directory or a glob alike.
     *
     * A directory includes the TypeScript files under it, never what its dependencies installed: a
     * project given as `.` would otherwise walk `node_modules`.
     */
    expand: (path): FilePath[] =>
      globSync(Path.isDirectory(path) ? `${path}/${UNDER}` : path, {
        exclude: (found) => found.split(/[\\/]/).includes("node_modules"),
      }).map((file) => FilePath.seal(file)),
    /** Whether it starts with `!`, which removes what the rest matches. */
    excludes: (path): boolean => path.startsWith("!"),
    /**
     * The directory a glob starts in: the path up to its first wildcard, the directory itself, or a
     * file's directory.
     */
    base: (path): string => {
      if (Path.isDirectory(path)) return path;
      const parts = path.split(/[\\/]/);
      const wild = parts.findIndex((part) => /[*?[\]{}]/.test(part));
      return wild === -1 ? dirname(path) : parts.slice(0, wild).join("/") || ".";
    },
  }))
  .build();

/** The files of a project, resolved, as {@link Patterns.glob} found them. */
export type Project = Val<"Project", FilePath[]>;
export const Project = Val.companion<Project>()
  .impl(() => ({
    /**
     * Each file's path, modification time and size, or that it is gone. Saving any file changes
     * it, so a run's answer can be kept for as long as it holds.
     */
    stat: (project): string => stamp(project),
  }))
  .build();

/**
 * The directories a project's files can appear in: every directory under the one each pattern
 * starts in, except `node_modules` and those starting with a dot, which the glob skips.
 */
export type Directories = Val<"Directories", string[]>;
export const Directories = Val.companion<Directories>()
  .impl(() => ({
    /**
     * Each directory's path and modification time, or that it is gone. Adding, deleting or
     * renaming a file changes the time of the directory it is in, so the files a glob finds stay
     * the same for as long as this stamp does.
     */
    stat: (directories): string => stamp(directories),
  }))
  .build();

/**
 * The paths and globs that name a project. A path starting with `!` removes what it matches, as it
 * does on the command line.
 */
export type Patterns = Val<"Patterns", Path[]>;
export const Patterns = Val.companion<Patterns>()
  .implAssoc(({ seal }) => ({
    /**
     * The patterns the host's `settings.valof.project` names, as one pattern or a list of them, or
     * `src/**\/*.ts` when it names none.
     */
    fromSettings: (
      // A host may leave the settings out.
      settings: { valof?: { project?: string | readonly string[] } } | undefined,
    ): Patterns =>
      pipe(
        settings?.valof?.project ?? "src/**/*.ts",
        (given) => (typeof given === "string" ? [given] : [...given]),
        (given) => given.map((path) => Path.seal(path)),
        seal,
      ),
  }))
  .impl(() => ({
    /** The same patterns in the same order give the same key. */
    key: (patterns): string => patterns.join("\n"),
    /**
     * Every directory a file the patterns match can be in, walked from the one each pattern starts
     * in.
     */
    directories: (patterns): Directories =>
      pipe(
        patterns
          .filter((path) => !Path.excludes(path))
          .flatMap((path) => under(resolve(Path.base(path)))),
        (found) => [...new Set(found)],
        Directories.seal,
      ),
    /**
     * Expands every pattern, and removes what an exclusion matches. Resolved, since the glob that
     * reached a file and the one that excluded it need not be spelled alike.
     */
    glob: (patterns): Project => {
      const dropped = new Set(
        patterns
          .filter((path) => Path.excludes(path))
          .flatMap((path) =>
            pipe(path.slice(1), Path.seal, Path.expand, (files) =>
              files.map((file) => resolve(file)),
            ),
          ),
      );
      return Project.seal(
        patterns
          .filter((path) => !Path.excludes(path))
          .flatMap((path) => Path.expand(path))
          .map((file) => resolve(file))
          .filter((file) => !dropped.has(file))
          .map((file) => FilePath.seal(file)),
      );
    },
  }))
  .build();

/** Each path's modification time and size, or that it is gone. */
function stamp(paths: readonly string[]): string {
  return paths
    .map((path) => {
      const stats = statSync(path, { bigint: true, throwIfNoEntry: false });
      return stats ? `${path} ${stats.mtimeNs} ${stats.size}` : `${path} gone`;
    })
    .join("\n");
}

/**
 * The directory and every directory under it, except `node_modules` and those starting with a dot.
 */
function under(directory: string): string[] {
  try {
    return [
      directory,
      ...readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter(({ name }) => name !== "node_modules" && !name.startsWith("."))
        .flatMap(({ name }) => under(join(directory, name))),
    ];
  } catch {
    return [directory];
  }
}
