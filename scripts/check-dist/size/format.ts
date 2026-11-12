import { Imports } from "./bundle.ts";
import { BundleSize, modes, type BuildResult } from "./measure/index.ts";
import type { Report } from "./suite.ts";
import { pipe } from "../../../src/shared/pipe/index.ts";
import { align, Budget, bytes } from "../report.ts";

export function render({ bundles, separateBase }: Report): string {
  return [
    ...[...separateBase, ...bundles.map(({ build }) => build)].map((each) => `${sizes(each)}\n`),
    budgets(bundles),
  ].join("\n");
}

// An added bundle is budgeted by what it adds to the base.
function amount({ bundle }: BundleSize, value: number): string {
  return bundle.base ? bytes(value) : `+${bytes(value)}`;
}

function sizes(build: BuildResult): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  return pipe(
    [
      ["", ...heads],
      ...modes.map(({ _tag: mode }) => [
        mode,
        ...heads.map((head) => bytes(build[mode].sizes[head])),
      ]),
    ],
    (rows) => align(rows, ["left", "right", "right", "right"]),
    (rows) => rows.map((cells) => `  ${cells.join("  ")}`),
    (lines) => [`bundle  import { ${Imports.names(build.imports).join(", ")} }`, ...lines],
    (lines) => lines.join("\n"),
  );
}

function budgets(bundles: readonly BundleSize[]): string {
  return pipe(
    bundles.map((size) => {
      const budget = BundleSize.budget(size);
      return [
        budget.name,
        amount(size, budget.used),
        amount(size, budget.limit),
        Budget.left(budget),
      ];
    }),
    (rows) => align(rows, ["left", "right", "right", "left"]),
    (rows) =>
      rows.map(([name, used, limit, left]) => `  ${name}  ${used} / ${limit}  ${left}`.trimEnd()),
    (lines) => ["budget (production gzip)", ...lines],
    (lines) => lines.join("\n"),
  );
}
