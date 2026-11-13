import { Trait, type Self } from "#valof";

/** What a check found. A report that did not pass names why in what it renders. */
export type Report = Trait<
  "Report",
  Record<never, never>,
  {
    render: (self: Self) => string;
    /** False where what the check found is over a budget, stale or incompatible. */
    passed: (self: Self) => boolean;
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

/** The lines a report ends with when it did not pass, after a blank line. */
export function problemLines(problems: readonly string[]): string[] {
  return problems.length === 0 ? [] : ["", ...problems];
}
