import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>()
  .Circle.impl(() => ({ diameter: (c) => c.r * 2, area: (c) => Math.PI * c.r * c.r }))
  .Square.impl(() => ({ perimeter: (s) => s.side * 4, area: (s) => s.side * s.side }))
  .impl(() => ({ area: () => 0 }))
  .build();

const { Square } = Shape;

export const read = [Shape.Circle.diameter, Square.perimeter];
