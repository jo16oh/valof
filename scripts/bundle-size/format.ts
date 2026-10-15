import { Imports } from "./bundle.ts";
import { modes, type BuildResult, type BundleSize } from "./measure/index.ts";
import type { Report } from "./suite.ts";

export function over(size: BundleSize): string {
  return `over budget: ${label(size)} is ${amount(size, size.capped)}, budget ${amount(size, size.bundle.budget)}`;
}

export function render({ bundles, separateBase }: Report, asJson: boolean): string {
  return asJson
    ? json(bundles)
    : [
        ...[...separateBase, ...bundles.map(({ build }) => build)].map(
          (each) => `${sizes(each)}\n`,
        ),
        budgets(bundles),
      ].join("\n");
}

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

function align(rows: readonly (readonly string[])[], sides: readonly ("left" | "right")[]) {
  const columns = sides.map((side, index) => {
    const cells = rows.map((row) => row[index] ?? "");
    const width = Math.max(...cells.map((cell) => cell.length));
    return cells.map((cell) => (side === "left" ? cell.padEnd(width) : cell.padStart(width)));
  });
  return rows.map((_, index) => columns.map((cells) => cells[index] ?? ""));
}

function amount({ bundle }: BundleSize, bytes: number): string {
  return bundle.base ? format(bytes) : `+${format(bytes)}`;
}

function label({ bundle }: BundleSize): string {
  return bundle.base ? bundle.name : `added by ${bundle.name}`;
}

function sizes(build: BuildResult): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  const rows = align(
    [
      ["", ...heads],
      ...modes.map((mode) => [mode, ...heads.map((head) => format(build[mode].sizes[head]))]),
    ],
    ["left", "right", "right", "right"],
  );

  return [
    `bundle  import { ${Imports.names(build.imports).join(", ")} }`,
    ...rows.map((cells) => `  ${cells.join("  ")}`),
  ].join("\n");
}

function budgets(bundles: readonly BundleSize[]): string {
  const rows = bundles.map((size) => {
    const bytes = size.capped;
    const max = size.bundle.budget;
    const left =
      bytes > max
        ? `${format(bytes - max)} over`
        : `${format(max - bytes)} left (${Math.round((1 - bytes / max) * 100)}%)`;
    return [label(size), amount(size, bytes), amount(size, max), left];
  });

  return [
    "budget (production gzip)",
    ...align(rows, ["left", "right", "right", "left"]).map(([name, used, limit, left]) =>
      `  ${name}  ${used} / ${limit}  ${left}`.trimEnd(),
    ),
  ].join("\n");
}

function json(bundles: readonly BundleSize[]): string {
  const keyed = Object.fromEntries(
    bundles.map(({ bundle, build }) => [
      bundle.key,
      Object.fromEntries(modes.map((mode) => [mode, build[mode].sizes])),
    ]),
  );

  return JSON.stringify(keyed, null, 2);
}
