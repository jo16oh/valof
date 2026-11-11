import type { FilePath } from "./files.ts";
import { ParseCache } from "./parse-cache.ts";
import type { Parser } from "./parser.ts";
import { Modules } from "./scan/bindings.ts";
import { Scan } from "./scan/index.ts";
import type { ScanStore } from "./scan-store.ts";

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
  readonly #store: ScanStore | undefined;
  #scans = new Map<string, { source: string; scan: Scan }>();

  /** A cache that also looks in `store`, and keeps in it each scan it walks. */
  constructor(store?: ScanStore) {
    this.#store = store;
  }

  /** The scan of each file, in order. Forgets the files this call leaves out. */
  scan(
    parser: Parser,
    sources: readonly (readonly [FilePath, string])[],
    modules: Modules,
  ): Scan[] {
    const scans = new Map<string, { source: string; scan: Scan }>();
    const scanned = sources.map(([file, source]) => {
      const found = this.#scans.get(file);
      const kept = found?.source === source ? found.scan : this.#store?.find(file, source);
      const scan =
        kept && resolvesAlike(kept, file, modules)
          ? kept
          : this.#walk(parser, file, source, modules);
      scans.set(file, { source, scan });
      return scan;
    });
    this.#scans = scans;
    this.#parses.keep(sources.map(([file]) => file));

    return scanned;
  }

  #walk(parser: Parser, file: FilePath, source: string, modules: Modules): Scan {
    const scan = Scan.walk(file, this.#parses.tree(parser, file, source), modules, source);
    this.#store?.keep(file, source, scan);
    return scan;
  }
}

/** Whether every module the scan resolved still resolves to the same thing among `modules`. */
function resolvesAlike(scan: Scan, file: FilePath, modules: Modules): boolean {
  return Object.entries(scan.resolved).every(
    ([module, resolved]) => Modules.resolve(modules, file, module) === resolved,
  );
}
