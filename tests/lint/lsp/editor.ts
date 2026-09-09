import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The fixture project both servers open, and the working directory they are started in. */
const root = fileURLToPath(new URL("fixtures/", import.meta.url));

/** Both are pinned in `devDependencies`, so the version a finding is asserted against is fixed. */
const bin = (name: string): string =>
  fileURLToPath(new URL(`../../../node_modules/.bin/${name}`, import.meta.url));

/**
 * What a host needs before it lints, which is where the two differ. Everything after this is the
 * same call in the same order, since both speak LSP.
 */
export type Host = {
  command: string;
  args: string[];
  /** Added to the environment the server is started in. */
  env?: Record<string, string>;
  /** The answer to `workspace/configuration`, which is how each server is handed its config. */
  settings: object;
};

/**
 * ESLint's settings are the editor's, not ESLint's: this server is the one behind the VS Code
 * extension, and it reads what that extension sends.
 *
 * `useFlatConfig` names the experiment from ESLint 8, when a flat config meant importing
 * `FlatESLint` from `eslint/use-at-your-own-risk`. ESLint 10 has no such export, so the flag has
 * to be off for the server to load the plain `ESLint` class, which is flat-config only anyway.
 */
const eslintSettings = {
  validate: "on",
  useESLintClass: true,
  experimental: { useFlatConfig: false },
  format: false,
  quiet: false,
  onIgnoredFiles: "off",
  options: { overrideConfigFile: `${root}eslint.config.mjs` },
  rulesCustomizations: [],
  run: "onType",
  problems: { shortenToSingleLine: false },
  // Where the server resolves ESLint from. Left out, it asks a package manager for the global
  // install first.
  nodePath: fileURLToPath(new URL("../../../node_modules", import.meta.url)),
  workingDirectory: { directory: root },
  workspaceFolder: { uri: pathToFileURL(root).href, name: "fixtures" },
  codeAction: { disableRuleComment: { enable: false }, showDocumentation: { enable: false } },
};

export const oxlint: Host = {
  command: bin("oxlint"),
  args: ["--lsp"],
  // One thread, for the reason `tests/lint/hosts` gives. `--threads` reaches the run and not the
  // server, so the pool is capped where oxlint takes it from: rayon's own variable.
  env: { RAYON_NUM_THREADS: "1" },
  settings: { configPath: "oxlint.json" },
};

export const eslint: Host = {
  command: bin("vscode-eslint-language-server"),
  args: ["--stdio"],
  settings: eslintSettings,
};

type Incoming = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message: string };
};

/**
 * Findings come back as their messages alone. Where one sits, and what names the rule, is each
 * host's own spelling, `valof(unused-member)` against `valof/unused-member`, and
 * `tests/lint/hosts` pins those. The message is the same string from either.
 */
export type Editor = {
  /** Opens the file, by default as it sits on disk, and answers what the host reports. */
  open: (file: string, text?: string) => Promise<string[]>;
  /** Replaces the buffer, leaving disk alone. */
  type: (file: string, text: string) => Promise<string[]>;
  /** Writes a file the editor has not opened, and says so the way a file watcher would. */
  save: (file: string, text: string) => void;
  /** Asks again about a file already open, with nothing said about it in between. */
  recheck: (file: string) => Promise<string[]>;
  close: () => void;
};

/**
 * One host, started and driven the way an editor drives it.
 *
 * Diagnostics are pulled rather than waited for: both servers answer `textDocument/diagnostic`,
 * and a pull settles where a push leaves the test guessing how many are still coming.
 */
export async function start(host: Host): Promise<Editor> {
  const child = spawn(host.command, host.args, {
    cwd: root,
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, ...host.env },
  });

  let buffer = Buffer.alloc(0);
  let id = 0;
  const pending = new Map<number, (answer: Incoming) => void>();

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
      ) as Incoming;
      buffer = buffer.subarray(head + 4 + length);
      if (message.id === undefined) continue;
      // A request from the server, told apart by its method: each side numbers its own requests,
      // so an id alone says nothing about who is answering whom. Both servers ask for the
      // settings, and leaving either request unanswered stops the run before a file is linted.
      if (message.method !== undefined) {
        const items = (message.params as { items?: unknown[] } | undefined)?.items ?? [{}];
        write({
          id: message.id,
          result:
            message.method === "workspace/configuration" ? items.map(() => host.settings) : null,
        });
        continue;
      }
      const waiting = pending.get(message.id);
      if (waiting) {
        pending.delete(message.id);
        waiting(message);
      }
    }
  });

  const request = (method: string, params: object): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, ({ result, error }) =>
        error ? reject(new Error(`${method}: ${error.message}`)) : resolve(result),
      );
      write({ id: next, method, params });
    });

  const uri = (file: string): string => pathToFileURL(`${root}${file}`).href;

  const diagnostics = async (file: string): Promise<string[]> => {
    const answer = (await request("textDocument/diagnostic", {
      textDocument: { uri: uri(file) },
    })) as { items?: { message: string }[] };
    // Sorted, since the order two hosts report the same file in is their own business.
    return (answer.items ?? []).map(({ message }) => message).sort();
  };

  await request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: {
      workspace: { configuration: true, didChangeConfiguration: { dynamicRegistration: true } },
      textDocument: { synchronization: {}, diagnostic: {} },
    },
    initializationOptions: { settings: host.settings },
    workspaceFolders: [{ uri: pathToFileURL(root).href, name: "fixtures" }],
  });
  write({ method: "initialized", params: {} });

  const opened = new Set<string>();
  let version = 0;
  return {
    open: (file, text) => {
      // Closed first where a test before this one left it open, so the buffer starts from what
      // this test says rather than from what that one typed.
      if (opened.has(file))
        write({ method: "textDocument/didClose", params: { textDocument: { uri: uri(file) } } });
      opened.add(file);
      write({
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: uri(file),
            languageId: "typescript",
            version: ++version,
            text: text ?? readFileSync(`${root}${file}`, "utf8"),
          },
        },
      });
      return diagnostics(file);
    },
    // Whole-document sync, which is what an editor sends until it negotiates otherwise.
    type: (file, text) => {
      write({
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: uri(file), version: ++version },
          contentChanges: [{ text }],
        },
      });
      return diagnostics(file);
    },
    save: (file, text) => {
      writeFileSync(`${root}${file}`, text);
      write({
        method: "workspace/didChangeWatchedFiles",
        // 2 is Changed. An editor watches the project and sends this whoever wrote the file.
        params: { changes: [{ uri: uri(file), type: 2 }] },
      });
    },
    recheck: (file) => diagnostics(file),
    close: () => void child.kill(),
  };
}

/** The fixture as it sits on disk, for a test that edits it in the buffer. */
export const source = (file: string): string => readFileSync(`${root}${file}`, "utf8");
