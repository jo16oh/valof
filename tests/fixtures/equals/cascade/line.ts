import { Val } from "valof";
import type { Money } from "./money.ts";

export type OrderLine = Val<"OrderLine", { sku: string; total: Money }>;

export const OrderLine = Val.sealer<OrderLine>();
