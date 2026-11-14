import type { Enum as En } from "valof";

export type Shape = En<"Shape", { Circle: { r: number }; Square: { side: number } }>;
