import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>()
  .Circle.impl({ diameter: (c) => c.r * 2 })
  .Square.impl({ perimeter: (s) => s.side * 4, area: (s) => s.side * s.side })
  .impl({ sides: () => 4 })
  .build();

const { Square } = Shape;

export const read = [Shape.Circle.diameter, Square.perimeter];
