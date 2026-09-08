import { Val, type PayloadOf } from "valof";
import type { Money } from "./money.ts";

// Wrong for its own reasons, and the `PayloadOf` rule reports that. Not this rule's business:
// the brand is gone, so there is no child to dispatch to.
export type Order = Val<"Order", { id: string; total: PayloadOf<Money> }>;

export const Order = Val.sealer<Order>();
