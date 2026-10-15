import { Imports } from "./schema.ts";
import { capped, modes, type Measured, type Result, type Sizes } from "./measure.ts";

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

const amount = ({ bundle }: Result, bytes: number): string =>
  bundle.base ? format(bytes) : `+${format(bytes)}`;

const label = ({ bundle }: Result): string =>
  bundle.base ? bundle.name : `added by ${bundle.name}`;

/** A bundle's heading and its sizes in each mode. */
export function sizes({ imports, sizes }: Measured): string {
  const heads = ["minified", "gzip", "brotli"] as const;
  const rows = align(
    [
      ["", ...heads],
      ...modes.map((mode) => [mode, ...heads.map((head) => format(sizes[mode][head]))]),
    ],
    ["left", "right", "right", "right"],
  );
  return [
    `bundle  import { ${Imports.names(imports).join(", ")} }`,
    ...rows.map((cells) => `  ${cells.join("  ")}`),
  ].join("\n");
}

/** Each bundle's capped bytes against its budget. */
export function budgets(results: readonly Result[], base: Measured): string {
  const rows = results.map((result) => {
    const bytes = capped(result, base);
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

export function over(result: Result, base: Measured): string {
  return `over budget: ${label(result)} is ${amount(result, capped(result, base))}, budget ${amount(result, result.bundle.budget)}`;
}

/** The `--json` output, keyed as `replace-bundle-size-claims` reads it. */
export function json(results: readonly Result[]): string {
  const keyed: Record<string, Record<string, Sizes>> = Object.fromEntries(
    results.map(({ bundle, sizes }) => [bundle.key, sizes]),
  );
  return JSON.stringify(keyed, null, 2);
}
