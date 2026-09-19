import type { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
