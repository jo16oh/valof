import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { Resolver } from "./index.ts";

/** The subset of the TypeScript 5 / 6 API used here. It ships no types nameable from outside. */
type TypeScriptApi = {
  sys: Record<string, unknown>;
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

  const service = ts.createLanguageService(
    {
      getScriptFileNames: () => [...files],
      // Files are read once and never edited, so every snapshot stays at version 1.
      getScriptVersion: () => "1",
      getScriptSnapshot: (file: string) => {
        try {
          return ts.ScriptSnapshot.fromString(readFileSync(file, "utf8"));
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => ({ strict: true, noEmit: true }),
      getDefaultLibFileName: (options: unknown) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys["fileExists"],
      readFile: ts.sys["readFile"],
      readDirectory: ts.sys["readDirectory"],
      directoryExists: ts.sys["directoryExists"],
      getDirectories: ts.sys["getDirectories"],
    },
    ts.createDocumentRegistry(),
  );

  return {
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
