import type { Result as R } from "@praha/byethrow";
import { Trait, type Self } from "#valof";

import type { CheckError } from "./check.ts";

/** What a check found, printed whole and then judged. */
export type Report = Trait<
  "Report",
  Record<never, never>,
  {
    render: (self: Self) => string;
    /** Fails where what the check found is over a budget, stale or incompatible. */
    verdict: (self: Self) => R.Result<void, CheckError>;
  }
>;
export const Report = Trait.companion<Report>().build();

/** A size as a check prints it. A bundle-size claim states the size in the same form. */
export function bytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(2)} kB`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}

/** Pads each column to its widest cell, on the side given for it. */
export function align(
  rows: readonly (readonly string[])[],
  sides: readonly ("left" | "right")[],
): string[][] {
  const columns = sides.map((side, index) => {
    const cells = rows.map((row) => row[index] ?? "");
    const width = Math.max(...cells.map((cell) => cell.length));
    return cells.map((cell) => (side === "left" ? cell.padEnd(width) : cell.padStart(width)));
  });
  return rows.map((_, index) => columns.map((cells) => cells[index] ?? ""));
}
