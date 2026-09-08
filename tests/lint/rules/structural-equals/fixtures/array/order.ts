import { Val } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; charges: readonly Money[]; refunds: ReadonlyArray<Money> }>;

export const Order = Val.sealer<Order>();
