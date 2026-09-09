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
  expect(run("order.ts")).toEqual(["6:21-24  Order.total holds Money, which has its own equals"]);
});

test("takes a list for the project, and leaves out what one entry excludes", () => {
  const finding = "6:21-24  Order.total holds Money, which has its own equals";
  expect(run("order.ts", undefined, [project])).toEqual([finding]);
  // Money declares the `equals` the finding is about, so excluding it takes the finding with it.
  expect(run("order.ts", undefined, [project, `!${at("money.ts")}`])).toEqual([]);
});

test("says nothing about a file that holds no finding of its own", () => {
  expect(run("money.ts")).toEqual([]);
});

test("takes the buffer over the file, so a fix lands before the save", () => {
  const covered =
    'import { Val } from "valof";\n' +
    'import { Money } from "./money.ts";\n\n' +
    'export type Order = Val<"Order", { id: string; total: Money }>;\n\n' +
    "export const Order = Val.sealer<Order>().implEquals({ total: Money });\n";
  expect(run("order.ts", covered)).toEqual([]);
});

test("carries one kind each, so a project turns a rule off by leaving it out", () => {
  const reports: string[] = [];
  const one = context("order.ts", undefined, reports);
  plugin.rules["unused-member"].create(one).Program();
  expect(reports).toEqual([]);
  plugin.rules["structural-equals"].create(one).Program();
  expect(reports).toEqual(["6:21-24  Order.total holds Money, which has its own equals"]);
});

test("covers the name it points at, and the line where there is no name", () => {
  // `Val`, three characters in, is what the finding points at.
  expect(run("order.ts")[0]).toMatch(/^6:21-24 /);
  // A directive begins with `//`, which is no word, so the comment itself is underlined.
  expect(run("silenced.ts")).toEqual([
    "5:0-72  valof-lint-disable-next-line names unused-member, which reports nothing here",
  ]);
});

test("names every rule, under the plugin's own name", () => {
  expect(Object.keys(plugin.rules)).toEqual([...kinds]);
  expect(plugin.configs.recommended.rules).toEqual({
    "valof/aliased-val": "error",
    "valof/brand-mismatch": "error",
    // The value it makes is well formed; what it went around is the type's own way in.
    "valof/bypassed-companion": "warn",
    "valof/companion-mismatch": "error",
    "valof/duplicate-brand": "error",
    "valof/incomplete-disable": "error",
    "valof/split-companion": "error",
    "valof/structural-equals": "error",
    // The lift is sound; what it costs is the name that makes it greppable.
    "valof/unnamed-of": "warn",
    // Dead weight, not a defect: the code around either of these works.
    "valof/unused-disable": "warn",
    "valof/unused-member": "warn",
  });
});
