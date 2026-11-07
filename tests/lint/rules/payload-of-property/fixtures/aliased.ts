import { Val, type Payload, type PayloadOf } from "valof";

export type Money = Val<"Money", { cents: number }>;
type Amount = Payload<PayloadOf<Money>>;
type Cents = Payload<number>;

export type Invoice = Val<"Invoice", { total: Amount; tax: Cents }>;
export type Base = Val<"Base", Amount>;
