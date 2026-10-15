import { Imports } from "./bundle.ts";
import { modes, type Measured, type MeasuredBundle } from "./measure/index.ts";
import type { Measurement } from "./suite.ts";

export function over(result: MeasuredBundle): string {
  return `over budget: ${label(result)} is ${amount(result, result.capped)}, budget ${amount(result, result.bundle.budget)}`;
}

export function report({ results, separateBase }: Measurement, asJson: boolean): string {
  return asJson
    ? json(results)
    : [
        ...[...separateBase, ...results.map(({ measured }) => measured)].map(
          (each) => `${sizes(each)}\n`,
        ),
        budgets(results),
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

function amount({ bundle }: MeasuredBundle, bytes: number): string {
  return bundle.base ? format(bytes) : `+${format(bytes)}`;
}

function label({ bundle }: MeasuredBundle): string {
  return bundle.base ? bundle.name : `added by ${bundle.name}`;
}

function sizes(measured: Measured): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  const rows = align(
    [
      ["", ...heads],
      ...modes.map((mode) => [mode, ...heads.map((head) => format(measured[mode].sizes[head]))]),
    ],
    ["left", "right", "right", "right"],
  );
  return [
    `bundle  import { ${Imports.names(measured.imports).join(", ")} }`,
    ...rows.map((cells) => `  ${cells.join("  ")}`),
  ].join("\n");
}

function budgets(results: readonly MeasuredBundle[]): string {
  const rows = results.map((result) => {
    const bytes = result.capped;
    const max = result.bundle.budget;
    const left =
      bytes > max
        ? `${format(bytes - max)} over`
        : `${format(max - bytes)} left (${Math.round((1 - bytes / max) * 100)}%)`;
    return [label(result), amount(result, bytes), amount(result, max), left];
  });
  return [
    "budget (production gzip)",
    ...align(rows, ["left", "right", "right", "left"]).map(([name, used, limit, left]) =>
      `  ${name}  ${used} / ${limit}  ${left}`.trimEnd(),
    ),
  ].join("\n");
}

function json(results: readonly MeasuredBundle[]): string {
  const keyed = Object.fromEntries(
    results.map(({ bundle, measured }) => [
      bundle.key,
      Object.fromEntries(modes.map((mode) => [mode, measured[mode].sizes])),
    ]),
  );
  return JSON.stringify(keyed, null, 2);
}
