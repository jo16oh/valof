import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.sealer<Shape>()
  .implVariant("Circle", (variant) => variant.impl({ diameter: (c) => c.r * 2 }))
  .implVariant("Square", (variant) => {
    return variant.impl({ perimeter: (s) => s.side * 4, area: (s) => s.side * s.side });
  })
  .impl({ sides: () => 4 });

const { Square } = Shape;

export const read = [Shape.Circle.diameter, Square.perimeter];
