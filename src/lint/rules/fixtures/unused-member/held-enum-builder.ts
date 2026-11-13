import { Enum } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const builder = Enum.companion<Shape>();
export const Shape = builder.Circle.impl(() => ({ diameter: (c) => c.r * 2 })).build();
