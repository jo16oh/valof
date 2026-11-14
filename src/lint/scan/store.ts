import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FilePath, Project } from "../shared/files.ts";
import { Scan } from "./index.ts";

/**
 * Scans kept on disk between processes, so a new run walks only the files that changed.
 *
 * Each scan is kept under its file and a hash of the text it was walked from. The store as a whole
 * belongs to one build of the linter, identified by `fingerprint`, and a store left by another
 * build returns no scan. Failing to read or write it costs a walk, never a finding.
 */
export class ScanStore {
  readonly #path: string | undefined;
  readonly #fingerprint: string;
  readonly #saved: Record<string, { hash: string; scan: Scan }>;
  #touched = new Map<string, { hash: string; scan: Scan }>();
  #changed = false;

  /** A store at `path`, or one that keeps nothing when `path` is `undefined`. */
  constructor(path: string | undefined, fingerprint: string) {
    this.#path = path;
    this.#fingerprint = fingerprint;
    this.#saved = path === undefined ? {} : readSaved(path, fingerprint);
  }

  /**
   * The store under `node_modules/.cache/valof-lint` in `cwd`, or one that keeps nothing where
   * `cwd` has no `node_modules` or `VALOF_LINT_CACHE` is `0`.
   */
  static open(cwd = process.cwd(), env = process.env): ScanStore {
    const modules = join(cwd, "node_modules");
    const kept = env["VALOF_LINT_CACHE"] !== "0" && existsSync(modules);
    return new ScanStore(
      kept ? join(modules, ".cache", "valof-lint", "scans.json") : undefined,
      kept ? fingerprint() : "",
    );
  }

  /** The scan kept for `file` with the text `source`, if any. */
  find(file: FilePath, source: string): Scan | undefined {
    const kept = this.#saved[file];
    if (kept?.hash !== hashOf(source)) return undefined;

    // Parsed from JSON, so this process has not adopted it as a Scan yet.
    const scan = Scan.seal.nocopy(kept.scan);
    this.#touched.set(file, { hash: kept.hash, scan });
    return scan;
  }

  /** Keeps `scan` for `file` with the text `source`. */
  keep(file: FilePath, source: string, scan: Scan): void {
    this.#touched.set(file, { hash: hashOf(source), scan });
    this.#changed = true;
  }

  /** Writes the scans found or kept since the store opened, if it kept a new one. */
  save(): void {
    if (this.#path === undefined || !this.#changed) return;

    const content = JSON.stringify({
      fingerprint: this.#fingerprint,
      scans: Object.fromEntries(this.#touched),
    });
    // Renamed into place, so a process that stops halfway leaves the last store whole.
    const next = `${this.#path}.${process.pid}.${Math.random().toString(36).slice(2)}`;
    try {
      mkdirSync(dirname(this.#path), { recursive: true });
      writeFileSync(next, content);
      renameSync(next, this.#path);
      this.#changed = false;
      removeStale(this.#path);
    } catch {
      // The next run walks the files again.
      try {
        rmSync(next, { force: true });
      } catch {
        // Nothing was written where the directory could not be created.
      }
    }
  }
}

/** The saved scans at `path`, if the file holds a store of this build. */
function readSaved(
  path: string,
  fingerprint: string,
): Record<string, { hash: string; scan: Scan }> {
  try {
    const saved = JSON.parse(readFileSync(path, "utf8")) as {
      fingerprint?: string;
      scans?: Record<string, { hash: string; scan: Scan }>;
    };
    return saved.fingerprint === fingerprint ? (saved.scans ?? {}) : {};
  } catch {
    return {};
  }
}

/** The hash a scan is kept under. */
function hashOf(source: string): string {
  return createHash("sha1").update(source).digest("base64");
}

/**
 * The path, modification time and size of each of the linter's own files, and of the parser's
 * `package.json`. Run from source, the linter's files are everything under `src`. Run from the
 * package, they are everything under the built module's directory. Editing the linter, or
 * installing another version of it or of oxc-parser, discards the store.
 */
function fingerprint(): string {
  const source = import.meta.url.endsWith(".ts");
  const root = fileURLToPath(new URL(source ? ".." : ".", import.meta.url));
  try {
    const own = filesUnder(root).filter((file) => /\.[cm]?[jt]s$|package\.json$/.test(file));
    return Project.stat(
      Project.seal([...own, parserManifest()].map((file) => FilePath.seal(file))),
    );
  } catch {
    return String(Math.random());
  }
}

/** Every file under `dir`, leaving out `node_modules` and every file or directory whose name
 * starts with a dot. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/** The path of oxc-parser's `package.json`, or a path where no file exists when oxc-parser is not installed. */
function parserManifest(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.resolve("oxc-parser")));
    while (!existsSync(join(dir, "package.json")) && dirname(dir) !== dir) {
      dir = dirname(dir);
    }
    return join(dir, "package.json");
  } catch {
    return "oxc-parser";
  }
}

/**
 * Removes the temporary files left beside `path` by saves that stopped halfway. A file under a
 * minute old may belong to a save another process is still writing, so it stays.
 */
function removeStale(path: string): void {
  const dir = dirname(path);
  const prefix = `${basename(path)}.`;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue;
      const file = join(dir, name);
      if (Date.now() - statSync(file).mtimeMs > 60_000) {
        rmSync(file, { force: true });
      }
    }
  } catch {
    // The next save tries again.
  }
}
