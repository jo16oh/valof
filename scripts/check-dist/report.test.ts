import { describe, expect, test } from "vite-plus/test";

import { Budget, bytes, OverBudgetError } from "./report.ts";

test("prints bytes below 1 kB as they are, and above it in kB", () => {
  expect([bytes(1023), bytes(1024), bytes(1100)]).toEqual(["1023 B", "1.00 kB", "1.07 kB"]);
});

describe("Budget", () => {
  const instantiations = (used: number) =>
    Budget.seal({ name: "core", used, limit: 10_000, unit: "count" });
  const declarations = (used: number) =>
    Budget.seal({ name: "index.d.ts", used, limit: 2048, unit: "bytes" });

  test("prints what is left, in the budget's unit", () => {
    expect(Budget.left(instantiations(9386))).toBe("614 left (6%)");
    expect(Budget.left(declarations(1024))).toBe("1.00 kB left (50%)");
  });

  test("is over only past its limit", () => {
    expect(Budget.over(instantiations(10_000))).toBe(false);
    expect(Budget.over(instantiations(10_001))).toBe(true);
    expect(Budget.left(instantiations(12_345))).toBe("2,345 over");
  });

  test("reports each budget it is over on a line of its own", () => {
    expect(new OverBudgetError({ over: [instantiations(12_345), declarations(4096)] }).message)
      .toBe(`over budget: core is 12,345, budget 10,000
over budget: index.d.ts is 4.00 kB, budget 2.00 kB`);
  });
});
