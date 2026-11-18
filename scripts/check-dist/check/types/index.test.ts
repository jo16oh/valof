import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "vite-plus/test";

import { Budget } from "../budget.ts";
import { Counts, TypesDeclaration, TypesFixture, TypesReport } from "./index.ts";

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
    TypesReport.seal({
      typescript: "5.9.3",
      baseline: counts,
      fixtures: [],
      declarations: [],
      budgets,
    });
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

test("explains each declaration file it measured", () => {
  const counts = Counts.seal({ types: 0, instantiations: 0, check: 0, total: 0 });
  const declaration = TypesDeclaration.seal({
    name: "x.d.ts",
    path: "dist/x.d.ts",
    description: "what x exports",
    budget: 1,
  });
  const report = TypesReport.seal({
    typescript: "5.9.3",
    baseline: counts,
    fixtures: [],
    declarations: [declaration],
    budgets: [],
  });

  expect(TypesReport.render(report).split("\n")).toContain("x.d.ts: what x exports");
});

test("measures a declaration file with the files it imports, each once, under its name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "valof-types-"));
  try {
    const root = pathToFileURL(`${directory}/`);
    await mkdir(new URL("dist/", root));
    // 48, 24 and 19 bytes. `a` is reached twice and counted once.
    await writeFile(
      new URL("dist/x.d.ts", root),
      'export * from "./a.ts";\nexport * from "./b.ts";\n',
    );
    await writeFile(new URL("dist/b.d.ts", root), 'export * from "./a.ts";\n');
    await writeFile(new URL("dist/a.d.ts", root), "export type A = 1;\n");
    const declaration = TypesDeclaration.seal({
      name: "x.d.ts",
      path: "dist/x.d.ts",
      description: "",
      budget: 128,
    });

    expect(await TypesDeclaration.measure(declaration, root)).toEqual(
      Budget.seal({ name: "x.d.ts", used: 91, limit: 128, unit: "bytes" }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
