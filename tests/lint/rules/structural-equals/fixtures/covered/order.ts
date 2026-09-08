import { Val } from "valof";
import { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

export const Order = Val.sealer<Order>().implEquals({ total: Money });
