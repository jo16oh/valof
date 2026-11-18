import { Enum, Val, type Payload } from "valof";

export type Base = Payload<{ id: string }>;
export type Choice = Enum<"Choice", { A: { box: { n: number } }; B: { m: number } }>;
export type Joined = Val<"Joined", Base & { total: { amount: number } }>;
export type Listed = Val<"Listed", { items: { n: number }[] }>;
export type Mapped = Val<"Mapped", { m: { [K in "a"]: number } }>;
