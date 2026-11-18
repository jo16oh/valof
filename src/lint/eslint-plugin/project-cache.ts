import { Directories, Patterns, type Project } from "../shared/files.ts";

/**
 * Each project, globbed again only once a file is added to or deleted from it.
 *
 * The host walks the same project file by file, so the glob would otherwise run again for each. A
 * language server runs for as long as the editor is open, so a project globbed once would miss the
 * files added since, and fail to read those deleted. Statting the directories the files can be in
 * detects both.
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
