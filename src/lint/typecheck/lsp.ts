import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve as absolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Resolver } from "./index.ts";

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
export function overLsp(bin: string, root: string): Resolver {
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
      // A request from the server, `client/registerCapability` among them. Leaving one
      // unanswered deadlocks it. Told apart by its method rather than by its id: each side
      // numbers its own requests, so the two run into each other.
      if (message.method !== undefined) {
        write({
          id: message.id,
          result: message.method === "workspace/configuration" ? [{}] : null,
        });
        continue;
      }
      const waiting = pending.get(message.id);
      if (waiting) {
        pending.delete(message.id);
        waiting(message.result);
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

  const open = new Map<string, { text: string; version: number }>();
  const lines = new Map<string, LineMap>();
  // Keyed absolute, since an overlay drops the entry it replaced and its paths are absolute.
  const lineMap = (file: string): LineMap => {
    const key = absolute(root, file);
    let map = lines.get(key);
    if (!map) {
      const text = open.get(key)?.text ?? readFileSync(file, "utf8");
      lines.set(key, (map = buildLineMap(text)));
    }
    return map;
  };

  const uri = (file: string) => pathToFileURL(file).href;
  const folder = { uri: pathToFileURL(root).href, name: "valof-lint" };

  // No `textDocument/didOpen` for the scanned set. The server reads committed files from disk and
  // opens one lazily when a request names it; `didOpen` is for buffers an editor holds unsaved,
  // which is what `overlay` sends and nothing else does. Opening the whole scanned set makes the
  // server build a document for each and the first query wait on all of them: 436 ms against
  // 45 ms for the same answers.
  const ready = request("initialize", {
    processId: process.pid,
    rootUri: folder.uri,
    capabilities: {},
    workspaceFolders: [folder],
  }).then(() => {
    write({ method: "initialized", params: {} });
  });

  // Chained rather than awaited at each caller, so the notifications an overlay sends land
  // before the requests that read them however the two are interleaved.
  let queue = ready;

  return {
    overlay: (sources) => {
      const wanted = new Map([...sources].map(([file, text]) => [absolute(root, file), text]));
      const changed: { file: string; text?: string }[] = [];
      for (const [file, text] of wanted)
        if (open.get(file)?.text !== text) changed.push({ file, text });
      for (const file of open.keys()) if (!wanted.has(file)) changed.push({ file });

      if (changed.length === 0) return;
      // The line map is built from whichever source answered, so it goes with the text.
      for (const { file } of changed) lines.delete(file);
      queue = queue.then(() => {
        for (const { file, text } of changed) {
          if (text === undefined) {
            open.delete(file);
            write({
              method: "textDocument/didClose",
              params: { textDocument: { uri: uri(file) } },
            });
            continue;
          }
          const version = (open.get(file)?.version ?? 0) + 1;
          const held = open.has(file);
          open.set(file, { text, version });
          if (held)
            write({
              method: "textDocument/didChange",
              params: {
                textDocument: { uri: uri(file), version },
                contentChanges: [{ text }],
              },
            });
          else
            write({
              method: "textDocument/didOpen",
              params: {
                textDocument: { uri: uri(file), languageId: "typescript", version, text },
              },
            });
        }
      });
    },
    resolveAll: async (queries) => {
      await queue;
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
