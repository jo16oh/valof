import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

// Dropping the key from equality is still the author saying they looked at it.
export const Order = Val.sealer<Order>().implEquals({ total: () => true });
