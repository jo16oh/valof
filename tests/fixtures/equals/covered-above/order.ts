import { Val } from "valof";
import { Money } from "./money.ts";

export type Order = Val<"Order", { id: string; shipping: { fee: Money } }>;

// The entry owns everything below `shipping`, `fee` included.
export const Order = Val.sealer<Order>().implEquals({
  shipping: (a, b) => Money.equals(a.fee, b.fee),
});
