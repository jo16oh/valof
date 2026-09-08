import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

import plugin from "../../../src/lint/eslint-plugin.ts";

// The host is not a dependency, so the rule is called the way ESLint and oxlint both call it.
// That the two really do call it this way is checked by hand, not here.

const at = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const project = at("*.ts");

const run = (name: string, options: object = {}, text?: string): string[] => {
  const file = at(name);
  const reports: string[] = [];
  const context = {
    filename: file,
    options: [{ project, ...options }],
    sourceCode: { text: text ?? readFileSync(file, "utf8") },
    report: ({ loc, message }: { loc: { line: number; column: number }; message: string }) =>
      void reports.push(`${loc.line}:${loc.column}  ${message}`),
  };
  plugin.rules.findings.create(context).Program();
  return reports;
};

test("reports on the file it was called for, having read the whole project", () => {
  expect(run("order.ts")).toEqual([
    "6:21  structural-equals: Order.total holds Money, which has its own equals",
  ]);
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
  expect(run("order.ts", {}, covered)).toEqual([]);
});

test("leaves a kind out on request", () => {
  expect(run("order.ts", { skip: ["structural-equals"] })).toEqual([]);
});
