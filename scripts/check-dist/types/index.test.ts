import { Result as R } from "@praha/byethrow";
import { expect, test } from "vite-plus/test";

import { Budget } from "../report.ts";
import { Counts, TypesReport } from "./index.ts";

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

test("fails on the budgets over their limit, and on none other", () => {
  const counts = Counts.seal({ types: 0, instantiations: 0, check: 0, total: 0 });
  const over = Budget.seal({ name: "core", used: 10_001, limit: 10_000, unit: "count" });
  const within = Budget.seal({ name: "index.d.ts", used: 1, limit: 2, unit: "bytes" });
  const report = (budgets: Budget[]) =>
    TypesReport.seal({ typescript: "5.9.3", baseline: counts, fixtures: [], budgets });

  const verdict = TypesReport.verdict(report([over, within]));
  expect(
    R.isFailure(verdict) && verdict.error.name === "OverBudgetError" && verdict.error.over,
  ).toEqual([over]);
  expect(R.isSuccess(TypesReport.verdict(report([within])))).toBe(true);
});
