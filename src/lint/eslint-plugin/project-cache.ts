import { Patterns, type Project } from "../files.ts";

/**
 * Each project, globbed once however many files are linted.
 *
 * The host walks the same project file by file, so the glob would otherwise run again for each.
 */
export class ProjectCache {
  readonly #projects = new Map<string, Project>();

  glob(patterns: Patterns): Project {
    const key = Patterns.key(patterns);
    let found = this.#projects.get(key);
    if (!found) this.#projects.set(key, (found = Patterns.glob(patterns)));
    return found;
  }
}
