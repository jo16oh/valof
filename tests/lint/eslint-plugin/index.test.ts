import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import plugin from "../../../src/lint/eslint-plugin.ts";
import { kinds } from "../../../src/lint/index.ts";

// The host is not a dependency, so the rules are called the way ESLint and oxlint both call them.
// That the two really do call them this way is checked by hand, not here.

type Where = { line: number; column: number };

const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
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
  for (const rule of Object.values(plugin.rules)) rule.create(one).Program();
  return reports;
};

test("reports on the file it was called for, having read the whole project", () => {
  expect(run("money.ts")).toEqual(["6:2-8  Money.format is never read"]);
});

test("takes a list for the project, and leaves out what one entry excludes", () => {
  const finding = "6:2-8  Money.format is never read";
  expect(run("money.ts", undefined, [project])).toEqual([finding]);
  expect(run("money.ts", undefined, [project, `!${at("order.ts")}`])).toEqual([finding]);
});

test("says nothing about a file that holds no finding of its own", () => {
  expect(run("order.ts")).toEqual([]);
});

test("takes the buffer over the file, so a fix lands before the save", () => {
  const changed =
    'import { Val } from "valof";\n' +
    'export type Order = Val<"Order", { id: string }>;\n\n' +
    "export const Order = Val.companion<Order>().impl(() => ({\n  label: (order) => order.id,\n})).build();\n";
  expect(run("order.ts", changed)).toEqual(["5:2-7  Order.label is never read"]);
});

test("carries one kind each, so a project turns a rule off by leaving it out", () => {
  const reports: string[] = [];
  const one = context("money.ts", undefined, reports);
  plugin.rules["unused-member"].create(one).Program();
  expect(reports).toEqual(["6:2-8  Money.format is never read"]);
  plugin.rules["duplicate-brand"].create(one).Program();
  expect(reports).toEqual(["6:2-8  Money.format is never read"]);
});

test("covers the name it points at, and the line where there is no name", () => {
  expect(run("money.ts")[0]).toMatch(/^6:2-8 /);
  // A directive begins with `//`, which is no word, so the comment itself is underlined.
  expect(run("silenced.ts")).toEqual([
    "5:0-72  valof-lint-disable-next-line names unused-member, which reports nothing here",
  ]);
});

test("names every rule, under the plugin's own name", () => {
  expect(Object.keys(plugin.rules)).toEqual([...kinds]);
  expect(plugin.configs.recommended.rules).toEqual({
    // The members work, but the block gives them state they share and no reader sees.
    "valof/block-step": "warn",
    "valof/hidden-optional": "error",
    "valof/payload-of-property": "error",
    "valof/unreturned-seal": "error",
    "valof/unrelated-assoc": "warn",
    "valof/constructor-name": "warn",
    "valof/split-variant-steps": "warn",
    "valof/unqualified-variant": "warn",
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
    "valof/unnamed-of": "warn",
    // Dead weight, not a defect: the code around either of these works.
    "valof/unused-disable": "warn",
    "valof/unused-member": "warn",
  });
});

test("runs model-only-in-valof with the settings under its name, and not from an older run's", () => {
  const file = at("model/row.ts");
  const text = readFileSync(file, "utf8");
  const reported = (model?: { classes: boolean }): string[] => {
    const reports: string[] = [];
    plugin.rules["model-only-in-valof"]
      .create({
        filename: file,
        settings: { valof: { project: file, ...(model ? { "model-only-in-valof": model } : {}) } },
        sourceCode: { text },
        report: ({ loc, message }) => void reports.push(`${loc.start.line}:${message}`),
      })
      .Program();
    return reports;
  };
  const row = "1:Row declares a data type outside Valof; model it as a Val, an Enum or a Trait";
  expect(reported()).toEqual([row]);
  expect(reported({ classes: true })).toEqual([
    row,
    "3:a class declares data outside Valof; model it as a Val",
  ]);
});
