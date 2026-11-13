import { Val } from "#valof";

import { bytes, count } from "./report.ts";

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
    /** The line a report prints for a budget it is over. */
    overLine: (budget): string =>
      `over budget: ${budget.name} is ${Budget.amount(budget, budget.used)}, budget ${Budget.amount(budget, budget.limit)}`,
    left: (budget): string =>
      Budget.over(budget)
        ? `${Budget.amount(budget, budget.used - budget.limit)} over`
        : `${Budget.amount(budget, budget.limit - budget.used)} left (${Math.round((1 - budget.used / budget.limit) * 100)}%)`,
  }))
  .build();
