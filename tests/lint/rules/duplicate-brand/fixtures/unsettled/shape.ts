import type { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", Record<string, { n: number }>>;
