import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import plugin from "../../../src/lint/eslint-plugin.ts";
import { kinds } from "../../../src/lint/index.ts";

// The host is not a dependency, so the rules are called the way ESLint and oxlint both call them.
// That the two really do call them this way is checked by hand, not here.

const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const project = at("*.ts");

const context = (name: string, text?: string, reports: string[] = []) => ({
  filename: at(name),
  settings: { valof: { project } },
  sourceCode: { text: text ?? readFileSync(at(name), "utf8") },
  report: ({ loc, message }: { loc: { line: number; column: number }; message: string }) =>
    void reports.push(`${loc.line}:${loc.column}  ${message}`),
});

/** Every rule over one file, as a host runs them. */
const run = (name: string, text?: string): string[] => {
  const reports: string[] = [];
  const one = context(name, text, reports);
  for (const rule of Object.values(plugin.rules)) rule.create(one).Program();
  return reports;
};

test("reports on the file it was called for, having read the whole project", () => {
  expect(run("order.ts")).toEqual(["6:21  Order.total holds Money, which has its own equals"]);
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
  expect(reports).toEqual(["6:21  Order.total holds Money, which has its own equals"]);
});

test("names every rule, under the plugin's own name", () => {
  expect(Object.keys(plugin.rules)).toEqual([...kinds]);
  expect(plugin.configs.recommended.rules).toEqual(
    Object.fromEntries(kinds.map((kind) => [`valof/${kind}`, "error"])),
  );
});
