import { expect, test } from "vite-plus/test";

import { Budget } from "../budget.ts";
import { Counts, TypesFixture, TypesReport } from "./index.ts";

test("reads the counts tsc prints, over a baseline", () => {
  const counts = Counts.fromDiagnostics(
    "Files: 3\nTypes:  427\nInstantiations:  1763\nCheck time:  0.31s\nTotal time:  0.90s\n",
  );
  expect(counts).toEqual({ types: 427, instantiations: 1763, check: 0.31, total: 0.9 });

  const baseline = Counts.seal({ types: 86, instantiations: 100, check: 0.1, total: 0.2 });
  expect(Counts.above(counts, baseline)).toEqual({
    types: 341,
    instantiations: 1663,
    check: 0.31,
    total: 0.9,
  });
});

test("fails on the budgets over their limit, and names only those", () => {
  const counts = Counts.seal({ types: 0, instantiations: 0, check: 0, total: 0 });
  const over = Budget.seal({ name: "core", used: 10_001, limit: 10_000, unit: "count" });
  const within = Budget.seal({ name: "index.d.ts", used: 1, limit: 2, unit: "bytes" });
  const report = (budgets: Budget[]) =>
    TypesReport.seal({ typescript: "5.9.3", baseline: counts, fixtures: [], budgets });
  const named = (budgets: Budget[]) =>
    TypesReport.render(report(budgets))
      .split("\n")
      .filter((line) => line.startsWith("over budget"));

  expect(TypesReport.passed(report([over, within]))).toBe(false);
  expect(named([over, within])).toEqual([Budget.overLine(over)]);
  expect(TypesReport.passed(report([within]))).toBe(true);
  expect(named([within])).toEqual([]);
});

test("budgets a fixture's instantiations, not its types", () => {
  const counts = Counts.seal({ types: 3, instantiations: 7, check: 0, total: 0 });
  const fixture = TypesFixture.seal({ name: "fixture", budget: 8 });

  expect(TypesFixture.budget(fixture, counts)).toEqual(
    Budget.seal({ name: "fixture", used: 7, limit: 8, unit: "count" }),
  );
});
