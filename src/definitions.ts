import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

/** A name to resolve, as a byte offset into a file. */
export type Query = { file: string; offset: number };

/** A declaration site, in the same terms. */
export type Definition = { file: string; offset: number };

/**
 * Resolves every query in one batch, answers positionally.
 *
 * A batch rather than one call per name because the TypeScript 7 backend talks over a pipe:
 * requests are multiplexed by id, so writing all of them and then reading collapses the round
 * trips into one. Measured on 200 names, that is 0.03 ms each against 1.52 ms one at a time.
 *
 * An empty entry means nothing resolved, which callers read as "cannot tell" rather than "not a
 * Val".
 */
export type Resolver = {
  resolveAll: (queries: readonly Query[]) => Promise<Definition[][]>;
  close: () => void;
};

/**
 * The user's own TypeScript, or `undefined`.
 *
 * Resolved from the scanned project, not from this package: valof does not depend on TypeScript.
 * What the linter needs is a tool to run, not a library to share, so there is no single instance
 * to keep and nothing to declare as a peer dependency.
 */
function locate(root: string): { main: string; bin: string; major: number } | undefined {
  try {
    const require = createRequire(`${root}/package.json`);
    const manifest = require.resolve("typescript/package.json");
    const { version } = require(manifest) as { version: string };
    return {
      main: require.resolve("typescript"),
      bin: manifest.replace(/package\.json$/, "bin/tsc"),
      major: Number(version.split(".")[0]),
    };
  } catch {
    return undefined;
  }
}

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
function inProcess(main: string, root: string, files: readonly string[]): Resolver {
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

type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition };
type LspMessage = { id?: number; method?: string; result?: unknown };

/**
 * Offsets in, LSP positions out, and back.
 *
 * The server reports `utf-16` as its position encoding, which is what a JavaScript string index
 * already counts, so a character is a code unit on both sides and only lines need mapping.
 */
type LineMap = {
  toPosition: (offset: number) => LspPosition;
  toOffset: (position: LspPosition) => number;
};

function buildLineMap(source: string): LineMap {
  const starts = [0];
  for (let i = source.indexOf("\n"); i !== -1; i = source.indexOf("\n", i + 1)) starts.push(i + 1);
  return {
    toPosition: (offset) => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if ((starts[mid] as number) <= offset) low = mid;
        else high = mid - 1;
      }
      return { line: low, character: offset - (starts[low] as number) };
    },
    toOffset: ({ line, character }) => (starts[line] ?? 0) + character,
  };
}

/** TypeScript 7, over `tsc --lsp --stdio`. Its in-process API is down to two exports. */
function overLsp(bin: string, root: string, files: readonly string[]): Resolver {
  const child = spawn(process.execPath, [bin, "--lsp", "--stdio"], {
    stdio: ["pipe", "pipe", "ignore"],
  });

  let buffer = Buffer.alloc(0);
  const pending = new Map<number, (result: unknown) => void>();

  const write = (message: object): void => {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const head = buffer.indexOf("\r\n\r\n");
      if (head === -1) return;
      const header = buffer.subarray(0, head).toString();
      const length = Number(/Content-Length: (\d+)/.exec(header)?.[1]);
      if (!Number.isFinite(length) || buffer.length < head + 4 + length) return;
      const message = JSON.parse(
        buffer.subarray(head + 4, head + 4 + length).toString(),
      ) as LspMessage;
      buffer = buffer.subarray(head + 4 + length);
      if (message.id === undefined) continue;
      const waiting = pending.get(message.id);
      if (waiting) {
        pending.delete(message.id);
        waiting(message.result);
        continue;
      }
      // A request from the server, `client/registerCapability` among them. Leaving one
      // unanswered deadlocks it.
      if (message.method !== undefined) {
        write({
          id: message.id,
          result: message.method === "workspace/configuration" ? [{}] : null,
        });
      }
    }
  });

  let id = 0;
  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      const current = ++id;
      pending.set(current, resolve);
      write({ id: current, method, params });
    });

  const lines = new Map<string, LineMap>();
  const lineMap = (file: string): LineMap => {
    let map = lines.get(file);
    if (!map) lines.set(file, (map = buildLineMap(readFileSync(file, "utf8"))));
    return map;
  };

  const uri = (file: string) => pathToFileURL(file).href;
  const folder = { uri: pathToFileURL(root).href, name: "valof-lint" };

  const ready = (async () => {
    await request("initialize", {
      processId: process.pid,
      rootUri: folder.uri,
      capabilities: {},
      workspaceFolders: [folder],
    });
    write({ method: "initialized", params: {} });
    for (const file of files) {
      write({
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: uri(file),
            languageId: "typescript",
            version: 1,
            text: readFileSync(file, "utf8"),
          },
        },
      });
    }
  })();

  return {
    resolveAll: async (queries) => {
      await ready;
      // Written first, awaited after, so the batch costs one round trip rather than one each.
      const replies = queries.map((query) =>
        request("textDocument/definition", {
          textDocument: { uri: uri(query.file) },
          position: lineMap(query.file).toPosition(query.offset),
        }),
      );
      return (await Promise.all(replies)).map((result) => {
        const found = Array.isArray(result) ? result : result === null ? [] : [result];
        return found.map((location) => {
          // `Location` when the client declares no link support, `LocationLink` otherwise.
          const target = location as {
            uri?: string;
            targetUri?: string;
            range?: LspRange;
            targetSelectionRange?: LspRange;
          };
          const file = fileURLToPath((target.uri ?? target.targetUri) as string);
          const range = (target.range ?? target.targetSelectionRange) as LspRange;
          return { file, offset: lineMap(file).toOffset(range.start) };
        });
      });
    },
    close: () => void child.kill(),
  };
}

/**
 * The backend for `files`, or `undefined` when the project has no TypeScript.
 *
 * Absent, the rule that needs it reports nothing rather than guessing. Silence is the safe
 * direction for every rule here.
 */
export function resolver(root: string, files: readonly string[]): Resolver | undefined {
  const found = locate(root);
  if (!found) return undefined;
  return found.major >= 7 ? overLsp(found.bin, root, files) : inProcess(found.main, root, files);
}
