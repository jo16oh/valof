import { Imports } from "./bundle.ts";
import { modes, type Measured, type MeasuredBundle } from "./measure.ts";
import type { Measurement } from "./suite.ts";

function format(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(2)} kB`;
}

/** Pads every column to its widest cell, aligned to the given side. */
function align(rows: readonly (readonly string[])[], sides: readonly ("left" | "right")[]) {
  const columns = sides.map((side, index) => {
    const cells = rows.map((row) => row[index] ?? "");
    const width = Math.max(...cells.map((cell) => cell.length));
    return cells.map((cell) => (side === "left" ? cell.padEnd(width) : cell.padStart(width)));
  });
  return rows.map((_, index) => columns.map((cells) => cells[index] ?? ""));
}

const amount = ({ bundle }: MeasuredBundle, bytes: number): string =>
  bundle.base ? format(bytes) : `+${format(bytes)}`;

const label = ({ bundle }: MeasuredBundle): string =>
  bundle.base ? bundle.name : `added by ${bundle.name}`;

/** A bundle's heading and its sizes in each mode. */
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

/** Each bundle's capped bytes against its budget. */
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

export function over(result: MeasuredBundle): string {
  return `over budget: ${label(result)} is ${amount(result, result.capped)}, budget ${amount(result, result.bundle.budget)}`;
}

/** The `--json` output, keyed as `replace-bundle-size-claims` reads it. */
function json(results: readonly MeasuredBundle[]): string {
  const keyed = Object.fromEntries(
    results.map(({ bundle, measured }) => [
      bundle.key,
      Object.fromEntries(modes.map((mode) => [mode, measured[mode].sizes])),
    ]),
  );
  return JSON.stringify(keyed, null, 2);
}

/** What a run prints: every bundle's sizes and the budgets, or the sizes as JSON. */
export function report({ results, extra }: Measurement, asJson: boolean): string {
  return asJson
    ? json(results)
    : [
        ...[...extra, ...results.map(({ measured }) => measured)].map((each) => `${sizes(each)}\n`),
        budgets(results),
      ].join("\n");
}
