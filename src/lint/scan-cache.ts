import type { FilePath } from "./files.ts";
import { ParseCache } from "./parse-cache.ts";
import type { Parser } from "./parser.ts";
import type { Modules } from "./scan/bindings.ts";
import { Scan } from "./scan/index.ts";

/**
 * Each file's scan, kept for as long as its text and the files in the run stay the same.
 *
 * A scan resolves the file's imports against the files in the run, so the cache walks every file
 * again once that set changes. Parsing does not depend on the set, and {@link ParseCache} keeps the
 * trees.
 */
export class ScanCache {
  readonly #parses = new ParseCache();
  #modules = "";
  #scans = new Map<string, { source: string; scan: Scan }>();

  /** The scan of each file, in order. Forgets the files this call leaves out. */
  scan(
    parser: Parser,
    sources: readonly (readonly [FilePath, string])[],
    modules: Modules,
  ): Scan[] {
    const known = Object.keys(modules.known).join("\n");
    const previous = known === this.#modules ? this.#scans : new Map<string, never>();
    const trees = this.#parses.parse(parser, sources);

    const scans = new Map<string, { source: string; scan: Scan }>();
    const scanned = sources.map(([file, source], index) => {
      const found = previous.get(file);
      const entry =
        found?.source === source
          ? found
          : { source, scan: Scan.walk(file, trees[index]!, modules, source) };
      scans.set(file, entry);
      return entry.scan;
    });
    this.#modules = known;
    this.#scans = scans;

    return scanned;
  }
}
