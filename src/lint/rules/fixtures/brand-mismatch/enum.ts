import type { Enum } from "valof";

export type Shape = Enum<"Shapes", { Circle: { r: number }; Square: { side: number } }>;
