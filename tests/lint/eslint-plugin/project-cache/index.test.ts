import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { ProjectCache } from "../../../../src/lint/eslint-plugin/project-cache.ts";
import { Path, Patterns } from "../../../../src/lint/files.ts";

/** Runs `act` in a fresh directory, and deletes the directory afterwards. */
const inDirectory = (act: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), "valof-project-cache-"));
  try {
    act(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const names = (files: readonly string[], dir: string): string[] =>
  files.map((file) => file.slice(dir.length + 1)).sort();

test.each([
  ["a glob", (dir: string) => `${dir}/**/*.ts`],
  ["a directory", (dir: string) => dir],
])(
  "globs %s again once a file is added or deleted anywhere under it, and not otherwise",
  (_, spell) => {
    inDirectory((dir) => {
      mkdirSync(join(dir, "empty"));
      writeFileSync(join(dir, "a.ts"), "");
      const cache = new ProjectCache();
      const patterns = Patterns.seal([Path.seal(spell(dir))]);
      const glob = (): string[] => names(cache.glob(patterns), dir);

      const first = cache.glob(patterns);
      expect(cache.glob(patterns)).toBe(first);

      writeFileSync(join(dir, "b.ts"), "");
      expect(glob()).toEqual(["a.ts", "b.ts"]);

      rmSync(join(dir, "a.ts"));
      expect(glob()).toEqual(["b.ts"]);

      // A directory that held no match when the glob ran, and one created after it.
      writeFileSync(join(dir, "empty", "d.ts"), "");
      expect(glob()).toEqual(["b.ts", "empty/d.ts"]);
      mkdirSync(join(dir, "sub"));
      writeFileSync(join(dir, "sub", "c.ts"), "");
      expect(glob()).toEqual(["b.ts", "empty/d.ts", "sub/c.ts"]);
    });
  },
);
