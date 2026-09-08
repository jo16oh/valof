import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

export const Order = Val.sealer<Order>()
  .implSeal((o, seal) => seal(o))
  .fixed<"id">();
