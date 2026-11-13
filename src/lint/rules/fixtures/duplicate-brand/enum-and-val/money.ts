import type { Enum } from "valof";

export type Money = Enum<"Money", { Dollar: { amount: number }; Yen: { amount: number } }>;
