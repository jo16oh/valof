import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

export const Order = Val.sealer<Order>().implEquals((a, b) => a.id === b.id);
