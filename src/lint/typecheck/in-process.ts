import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import type { Resolver } from "./index.ts";

/** The subset of the TypeScript 5 / 6 API used here. It ships no types nameable from outside. */
type TypeScriptApi = {
  sys: Record<string, unknown> & {
    fileExists: (file: string) => boolean;
    readFile: (file: string, encoding?: string) => string | undefined;
  };
  ScriptSnapshot: { fromString: (text: string) => unknown };
  getDefaultLibFilePath: (options: unknown) => string;
  createDocumentRegistry: () => unknown;
  createLanguageService: (
    host: Record<string, unknown>,
    registry: unknown,
  ) => {
    getDefinitionAtPosition: (
      file: string,
      offset: number,
    ) => readonly { fileName: string; textSpan: { start: number } }[] | undefined;
    dispose: () => void;
  };
};

/**
 * TypeScript 5 and 6, in this process.
 *
 * Their compiler API is complete, so no server is involved. What they lack is `tsc --lsp`, which
 * arrived only once that API went away.
 */
export function inProcess(main: string, root: string, files: readonly string[]): Resolver {
  const ts = createRequire(import.meta.url)(main) as TypeScriptApi;

  let open = new Map<string, string>();
  // The service caches per file until its version changes, so an overlay that edits one has to
  // move it. Which way it moves does not matter, only that it differs from what came before.
  const versions = new Map<string, number>();
  const bump = (file: string): void => void versions.set(file, (versions.get(file) ?? 0) + 1);

  const service = ts.createLanguageService(
    {
      getScriptFileNames: () => [...new Set([...files, ...open.keys()])],
      getScriptVersion: (file: string) => String(versions.get(resolve(root, file)) ?? 0),
      getScriptSnapshot: (file: string) => {
        const held = open.get(resolve(root, file));
        if (held !== undefined) return ts.ScriptSnapshot.fromString(held);
        try {
          return ts.ScriptSnapshot.fromString(readFileSync(file, "utf8"));
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => ({ strict: true, noEmit: true }),
      getDefaultLibFileName: (options: unknown) => ts.getDefaultLibFilePath(options),
      // An overlaid file may have no disk copy at all, and another file may import it.
      fileExists: (file: string) => open.has(resolve(root, file)) || ts.sys.fileExists(file),
      readFile: (file: string) => open.get(resolve(root, file)) ?? ts.sys.readFile(file),
      readDirectory: ts.sys["readDirectory"],
      directoryExists: ts.sys["directoryExists"],
      getDirectories: ts.sys["getDirectories"],
    },
    ts.createDocumentRegistry(),
  );

  return {
    overlay: (sources) => {
      const wanted = new Map([...sources].map(([file, text]) => [resolve(root, file), text]));
      for (const [file, text] of wanted) if (open.get(file) !== text) bump(file);
      for (const file of open.keys()) if (!wanted.has(file)) bump(file);
      open = wanted;
    },
    resolveAll: (queries) =>
      Promise.resolve(
        queries.map(({ file, offset }) =>
          (service.getDefinitionAtPosition(file, offset) ?? []).map((found) => ({
            file: found.fileName,
            offset: found.textSpan.start,
          })),
        ),
      ),
    close: () => service.dispose(),
  };
}
