import type { FilePath } from "./files.ts";
import { Parser } from "./parser.ts";

/**
 * Each file's syntax tree, kept for as long as its text stays the same.
 *
 * Parsing takes most of a run. A caller that runs over the same project again, as the plugin's
 * worker does, re-parses only the files whose text changed.
 */
export class ParseCache {
  #trees = new Map<string, { source: string; parsed: ReturnType<typeof Parser.exec> }>();

  /** The tree of each file, in order. Forgets the files this call leaves out. */
  parse(
    parser: Parser,
    sources: readonly (readonly [FilePath, string])[],
  ): ReturnType<typeof Parser.exec>[] {
    const trees = new Map<string, { source: string; parsed: ReturnType<typeof Parser.exec> }>();
    const parsed = sources.map(([file, source]) => {
      const found = this.#trees.get(file);
      const entry =
        found?.source === source ? found : { source, parsed: Parser.exec(parser, file, source) };
      trees.set(file, entry);
      return entry.parsed;
    });
    this.#trees = trees;

    return parsed;
  }
}
