import type { FilePath } from "../shared/files.ts";
import { Parser } from "./parser.ts";

/**
 * Each file's syntax tree, kept for as long as its text stays the same.
 *
 * Parsing takes most of a run. A caller that runs over the same project again, as the plugin's
 * worker does, re-parses only the files whose text changed.
 */
export class ParseCache {
  #trees = new Map<string, { source: string; parsed: ReturnType<typeof Parser.exec> }>();

  /** The file's tree, parsed again only once its text changes. */
  tree(parser: Parser, file: FilePath, source: string): ReturnType<typeof Parser.exec> {
    const found = this.#trees.get(file);
    if (found?.source === source) return found.parsed;

    const parsed = Parser.exec(parser, file, source);
    this.#trees.set(file, { source, parsed });
    return parsed;
  }

  /** Forgets every file but `files`. */
  keep(files: readonly string[]): void {
    const kept = new Set(files);
    for (const file of this.#trees.keys()) {
      if (!kept.has(file)) {
        this.#trees.delete(file);
      }
    }
  }
}
