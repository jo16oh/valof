import { Val } from "valof";

export type Money = Val<"Money", { amount: number; currency: string }>;

export const Money = Val.sealer<Money>().impl({
  format: (money) => `${money.amount} ${money.currency}`,
});
