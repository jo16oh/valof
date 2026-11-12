import { ErrorFactory } from "@praha/error-factory";
import { Val } from "#valof";

/** A size as the report prints it. A bundle-size claim states the size in the same form. */
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

/** One measurement against its budget. */
export type Budget = Val<
  "Budget",
  { name: string; used: number; limit: number; unit: "bytes" | "count" }
>;
export const Budget = Val.companion<Budget>()
  .impl(() => ({
    over: (budget): boolean => budget.used > budget.limit,
    amount: (budget, value: number): string =>
      budget.unit === "bytes" ? bytes(value) : count(value),
    left: (budget): string =>
      Budget.over(budget)
        ? `${Budget.amount(budget, budget.used - budget.limit)} over`
        : `${Budget.amount(budget, budget.limit - budget.used)} left (${Math.round((1 - budget.used / budget.limit) * 100)}%)`,
  }))
  .build();

export class OverBudgetError extends ErrorFactory({
  message: ({ over }) =>
    over
      .map(
        (budget) =>
          `over budget: ${budget.name} is ${Budget.amount(budget, budget.used)}, budget ${Budget.amount(budget, budget.limit)}`,
      )
      .join("\n"),
  fields: ErrorFactory.fields<{ over: Budget[] }>(),
}) {}
