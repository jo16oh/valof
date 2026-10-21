import { Val } from "valof";
import { Enum } from "valof/experimental";

export type Other = Val<"Other", { n: number }>;
export const Other = Val.companion<Other>();

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>()
  .implVariant("Circle", (variant) => Other.impl({ diameter: (o) => o.n * 2 }));
