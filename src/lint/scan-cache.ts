import type { FilePath } from "./files.ts";
import { ParseCache } from "./parse-cache.ts";
import type { Parser } from "./parser.ts";
import { Modules } from "./scan/bindings.ts";
import { Scan } from "./scan/index.ts";

/**
 * Each file's scan, kept for as long as its text stays the same and its imports and re-exports
 * resolve to the same files.
 *
 * A scan resolves the file's imports against the files in the run. When a file joins or leaves the
 * run, the cache walks again only the files with an import that now resolves elsewhere, and
 * {@link ParseCache} keeps the trees.
 */
export class ScanCache {
  readonly #parses = new ParseCache();
  #scans = new Map<string, { source: string; scan: Scan }>();

  /** The scan of each file, in order. Forgets the files this call leaves out. */
  scan(
    parser: Parser,
    sources: readonly (readonly [FilePath, string])[],
    modules: Modules,
  ): Scan[] {
    const trees = this.#parses.parse(parser, sources);

    const scans = new Map<string, { source: string; scan: Scan }>();
    const scanned = sources.map(([file, source], index) => {
      const found = this.#scans.get(file);
      const entry =
        found?.source === source && resolvesAlike(found.scan, file, modules)
          ? found
          : { source, scan: Scan.walk(file, trees[index]!, modules, source) };
      scans.set(file, entry);
      return entry.scan;
    });
    this.#scans = scans;

    return scanned;
  }
}

/** Whether every module the scan resolved still resolves to the same thing among `modules`. */
function resolvesAlike(scan: Scan, file: FilePath, modules: Modules): boolean {
  return Object.entries(scan.resolved).every(
    ([module, resolved]) => Modules.resolve(modules, file, module) === resolved,
  );
}
