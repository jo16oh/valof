import type { Enum } from "valof";

// @ts-expect-error -- an index signature names no variant
export type Shape = Enum<"Shape", Record<string, { n: number }>>;
