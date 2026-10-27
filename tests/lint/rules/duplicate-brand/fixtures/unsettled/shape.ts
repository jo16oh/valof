import type { Enum } from "valof";

export type Shape = Enum<"Shape", Record<string, { n: number }>>;
