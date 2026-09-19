import type { Enum } from "valof/experimental";

export type Shape = Enum<"Shapes", { Circle: { r: number }; Square: { side: number } }>;
