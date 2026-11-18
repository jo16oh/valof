import type { Enum } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export type Figure = Shape;
