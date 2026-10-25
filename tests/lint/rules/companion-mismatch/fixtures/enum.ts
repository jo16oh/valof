import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shapes = Enum.companion<Shape>().Circle.impl({ diameter: (c) => c.r * 2 }).build();
export const read = Shapes.Circle.diameter;
