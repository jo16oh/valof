import { Val, type Unpatchable } from "valof";
import type { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; total: Money }>;

export const Order = Val.companion<Order, [Unpatchable<"id">]>().implSeal((o, seal) => seal(o));
