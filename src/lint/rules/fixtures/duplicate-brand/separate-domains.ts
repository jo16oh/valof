import type { Trait, Val } from "valof";

export type Value = Val<"Shared", string>;
export type Behaviour = Trait<"Shared", { name: string }>;
