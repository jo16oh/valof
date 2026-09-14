import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; charges: Money[]; refunds: Array<Money> }>;

export const Order = Val.sealer<Order>();
