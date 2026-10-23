import { Val } from "valof";
import { Enum } from "valof/experimental";

export type Other = Val<"Other", { n: number }>;
const other = Val.companion<Other>();

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>()
  .implVariant("Circle", (variant) => other.impl({ diameter: (o) => o.n * 2 }).build())
  .build();
