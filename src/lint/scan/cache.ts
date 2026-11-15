import { Result as R } from "@praha/byethrow";

import { ParseCache } from "../parse/cache.ts";
import type { MissingParserError, Parser } from "../parse/parser.ts";
import type { FilePath } from "../shared/files.ts";
import { Modules } from "./bindings.ts";
import { Scan } from "./index.ts";
import type { ScanStore } from "./store.ts";

/**
 * Each file's scan, kept while its text stays the same and its imports and re-exports resolve to
 * the same files. When a file joins or leaves the run, only the files whose imports now resolve
 * elsewhere are walked again.
 */
export class ScanCache {
  readonly #parses = new ParseCache();
  readonly #store: ScanStore | undefined;
  #scans = new Map<string, { source: string; scan: Scan }>();

  /** A cache that also looks in `store`, and keeps in it each scan it walks. */
  constructor(store?: ScanStore) {
    this.#store = store;
  }

  /**
   * The scan of each file, in order. Forgets the files this call leaves out. Calls `load` only when
   * a file has to be walked, so a run that finds every scan kept never loads the parser.
   */
  async scan(
    load: () => R.ResultAsync<Parser, MissingParserError>,
    sources: readonly (readonly [FilePath, string])[],
    modules: Modules,
  ): R.ResultAsync<Scan[], MissingParserError> {
    const kept = sources.map(([file, source]) => {
      const found = this.#scans.get(file);
      const scan = found?.source === source ? found.scan : this.#store?.find(file, source);
      return scan && resolvesAlike(scan, file, modules) ? scan : undefined;
    });

    let parser: Parser | undefined;
    if (kept.includes(undefined)) {
      const loaded = await load();
      if (R.isFailure(loaded)) return loaded;
      parser = loaded.value;
    }

    const scans = new Map<string, { source: string; scan: Scan }>();
    const scanned = sources.map(([file, source], index) => {
      const scan = kept[index] ?? this.#walk(parser!, file, source, modules);
      scans.set(file, { source, scan });
      return scan;
    });
    this.#scans = scans;
    this.#parses.keep(sources.map(([file]) => file));

    return R.succeed(scanned);
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
