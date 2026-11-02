import { Enum, Val, type PayloadOf } from "valof";

export type Money = Val<"Money", { cents: number }>;

export type Order = Val<"Order", { total: PayloadOf<Money>; lines: readonly PayloadOf<Money>[] }>;
export type Priced = Val<"Priced", PayloadOf<Money> & { currency: string }>;
export type Wrapped = Val<"Wrapped", PayloadOf<Money>>;

export type Charge = Enum<
  "Charge",
  { Card: PayloadOf<Money>; Refund: { amount: PayloadOf<Money> } }
>;
