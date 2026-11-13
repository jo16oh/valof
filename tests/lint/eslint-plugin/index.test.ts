import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import plugin from "../../../src/lint/eslint-plugin/index.ts";
import { kinds } from "../../../src/lint/index.ts";
import { keeping } from "../support.ts";

// The rules are called here with a context holding only what they read. `tests/lint/hosts` runs
// them in ESLint and oxlint.

type Where = { line: number; column: number };

/** A fixture by its name, or a file elsewhere by its absolute path. */
const at = (name: string): string =>
  isAbsolute(name) ? name : fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const project = at("*.ts");

const context = (
  name: string,
  text?: string,
  reports: string[] = [],
  read: string | string[] = project,
) => ({
  filename: at(name),
  settings: { valof: { project: read } },
  sourceCode: { text: text ?? readFileSync(at(name), "utf8") },
  report: ({ loc, message }: { loc: { start: Where; end: Where }; message: string }) =>
    void reports.push(`${loc.start.line}:${loc.start.column}-${loc.end.column}  ${message}`),
});

/** Every rule over one file, as a host runs them. */
const run = (name: string, text?: string, read?: string | string[]): string[] => {
  const reports: string[] = [];
  const one = context(name, text, reports, read);
  for (const rule of Object.values(plugin.rules)) {
    rule.create(one).Program();
  }
  return reports;
};

/** The same in a host process of its own, started in `cwd`. */
const host = (cwd: string, name: string, env = process.env) => {
  const script = fileURLToPath(new URL("host.ts", import.meta.url));
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, name], {
    cwd,
    env,
    encoding: "utf8",
    // A host that never exits is a failure, not a run that never ends.
    timeout: 10_000,
  });
  return { status, stdout, stderr };
};

test("reports on the file it was called for, having read the whole project", () => {
  expect(run("money.ts")).toEqual(["6:2-8  Money.format is never read"]);
});

test("takes a list for the project, and leaves out what one entry excludes, however each is spelled", () => {
  const finding = "6:2-8  Money.format is never read";
  const spelled = (path: string): string => relative(process.cwd(), path);
  // `reader/show.ts` reads the member, so the finding goes only when the list keeps that file.
  expect(run("money.ts", undefined, [project, at("reader/*.ts")])).toEqual([]);
  expect(
    run("money.ts", undefined, [project, spelled(at("reader/*.ts")), `!${at("reader/show.ts")}`]),
  ).toEqual([finding]);
  expect(
    run("money.ts", undefined, [project, at("reader/*.ts"), `!${spelled(at("reader/show.ts"))}`]),
  ).toEqual([finding]);
});

test("shares one answer among the rules of a file, and asks again once the call stack empties", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-plugin-"));
  try {
    cpSync(at("money.ts"), join(dir, "money.ts"));
    writeFileSync(
      join(dir, "show.ts"),
      readFileSync(at("reader/show.ts"), "utf8").replace("../money.ts", "./money.ts"),
    );
    const lint = (): string[] => run(join(dir, "money.ts"), undefined, join(dir, "*.ts"));

    // The finding comes back only from a new run, so an emptied answer cannot pass for one.
    expect(lint()).toEqual([]);
    writeFileSync(join(dir, "show.ts"), "export {};\n");
    // A second rule of the same file gets the same answer, though show.ts changed on disk, because
    // the host runs a file's rules before the call stack empties.
    expect(lint()).toEqual([]);
    await Promise.resolve();
    expect(lint()).toEqual(["6:2-8  Money.format is never read"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps linting a project a file is deleted from or added to", async () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-plugin-"));
  try {
    cpSync(at("money.ts"), join(dir, "money.ts"));
    const reader = readFileSync(at("reader/show.ts"), "utf8").replace("../money.ts", "./money.ts");
    writeFileSync(join(dir, "show.ts"), reader);
    const lint = (): string[] => run(join(dir, "money.ts"), undefined, join(dir, "*.ts"));

    expect(lint()).toEqual([]);
    rmSync(join(dir, "show.ts"));
    await Promise.resolve();
    expect(lint()).toEqual(["6:2-8  Money.format is never read"]);
    writeFileSync(join(dir, "other.ts"), reader);
    await Promise.resolve();
    expect(lint()).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reads src/**/*.ts when no project is set", () => {
  expect(host(at("default"), "src/orders.ts")).toMatchObject({
    status: 0,
    stdout: 'Ref claims the brand "Ref", and so does another type\n',
  });
});

test("keeps the worker's scans under node_modules/.cache, and reports the same findings with them", () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-plugin-"));
  try {
    cpSync(at("default"), dir, { recursive: true });
    mkdirSync(join(dir, "node_modules"));
    const first = host(dir, "src/orders.ts", keeping());
    expect(existsSync(join(dir, "node_modules", ".cache", "valof-lint", "scans.json"))).toBe(true);
    expect(host(dir, "src/orders.ts", keeping())).toEqual(first);
    expect(first.stdout).toBe('Ref claims the brand "Ref", and so does another type\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps the scan of a saved file outside the project", () => {
  const dir = mkdtempSync(join(tmpdir(), "valof-plugin-"));
  try {
    cpSync(at("default"), dir, { recursive: true });
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "outside.ts"), "export {};\n");
    host(dir, "outside.ts", keeping());
    const store = join(dir, "node_modules", ".cache", "valof-lint", "scans.json");
    const { scans } = JSON.parse(readFileSync(store, "utf8")) as { scans: object };
    expect(Object.keys(scans)).toContain(join(realpathSync(dir), "outside.ts"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("says nothing about a file that holds no finding of its own", () => {
  expect(run("order.ts")).toEqual([]);
});

test("takes the buffer over the file, so a fix lands before the save", () => {
  const changed =
    'import { Val } from "valof";\n' +
    'export type Order = Val<"Order", { id: string }>;\n\n' +
    "export const Order = Val.companion<Order>().impl(() => ({\n  label: (order) => order.id,\n})).build();\n";
  // In one tick, as ESLint's `--fix` lints the fixed text again before the call stack empties.
  expect(run("order.ts")).toEqual([]);
  expect(run("order.ts", changed)).toEqual(["5:2-7  Order.label is never read"]);
});

test("carries one kind each, so a project turns a rule off by leaving it out", () => {
  const reports: string[] = [];
  const one = context("money.ts", undefined, reports);
  plugin.rules["unused-member"]!.create(one).Program();
  expect(reports).toEqual(["6:2-8  Money.format is never read"]);
  plugin.rules["duplicate-brand"]!.create(one).Program();
  expect(reports).toEqual(["6:2-8  Money.format is never read"]);
});

test("underlines the whole directive, which has no name to point at", () => {
  // A directive begins with `//`, which is no word, so the comment itself is underlined.
  expect(run("silenced.ts")).toEqual([
    "5:0-72  valof-lint-disable-next-line names unused-member, which reports nothing here",
  ]);
});

test("names every rule, under the plugin's own name", () => {
  expect(Object.keys(plugin.rules)).toEqual([...kinds]);
  expect(plugin.configs.recommended.rules).toEqual({
    // The members work, but what the step declares gives them state they share and no reader sees.
    "valof/hidden-shared-state-in-impl": "warn",
    "valof/hidden-optional": "error",
    "valof/detached-variant": "warn",
    "valof/unnecessary-alias": "error",
    "valof/unimplemented-trait": "error",
    "valof/brand-mismatch": "error",
    // The value it makes is well formed; what it went around is the type's own way in.
    "valof/bypassed-companion": "warn",
    "valof/companion-mismatch": "error",
    "valof/duplicate-brand": "error",
    "valof/incomplete-disable": "error",
    "valof/split-companion": "error",
    // The lift is sound; what it costs is the name that makes it greppable.
    "valof/inferred-val-of": "warn",
    // Dead weight, not a defect: the code around either of these works.
    "valof/unused-disable": "warn",
    "valof/unused-member": "warn",
  });
});

test("runs data-type-outside-valof with the settings under its name, and not from an older run's", () => {
  const file = at("model/row.ts");
  const text = readFileSync(file, "utf8");
  const reported = (model?: { classes: boolean }): string[] => {
    const reports: string[] = [];
    plugin.rules["data-type-outside-valof"]!.create({
      filename: file,
      settings: {
        valof: { project: file, ...(model ? { "data-type-outside-valof": model } : {}) },
      },
      sourceCode: { text },
      report: ({ loc, message }: { loc: { start: Where }; message: string }) =>
        void reports.push(`${loc.start.line}:${message}`),
    }).Program();
    return reports;
  };
  const row = "1:Row declares a data type outside Valof; model it as a Val, an Enum or a Trait";
  expect(reported()).toEqual([row]);
  expect(reported({ classes: true })).toEqual([
    row,
    "3:a class declares data outside Valof; model it as a Val",
  ]);
});
