import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const builder = Enum.sealer<Shape>();
export const Shape = builder.implVariant("Circle", (variant) =>
  variant.impl({ diameter: (c) => c.r * 2 }),
);
