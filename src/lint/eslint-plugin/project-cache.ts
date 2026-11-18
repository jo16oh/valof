import { Directories, Patterns, type Project } from "../shared/files.ts";

/**
 * Each project, globbed again only once a file is added to or deleted from it, which statting its
 * directories detects. A language server runs for as long as the editor is open, so a glob made
 * once misses files added or deleted since.
 */
export class ProjectCache {
  readonly #projects = new Map<
    string,
    { project: Project; directories: Directories; stamp: string }
  >();

  glob(patterns: Patterns): Project {
    const key = Patterns.key(patterns);
    const found = this.#projects.get(key);
    if (found && Directories.stat(found.directories) === found.stamp) return found.project;

    // Stamped before the glob, so a file added while it runs makes the next call glob again.
    const directories = Patterns.directories(patterns);
    const stamp = Directories.stat(directories);
    const project = Patterns.glob(patterns);
    this.#projects.set(key, { project, directories, stamp });

    return project;
  }
}
