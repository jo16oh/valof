import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

// valof-lint-disable-next-line structural-equals -- compared by id upstream
export const Order = Val.sealer<Order>();
