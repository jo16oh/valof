import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; shipping: { fee: Money } }>;

export const Order = Val.sealer<Order>();
