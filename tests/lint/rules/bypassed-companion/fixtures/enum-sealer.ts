import { Val } from "valof";
import { Enum, type VariantOf } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.sealer<Shape>();

export const circle = Val.of<VariantOf<Shape, "Circle">>({ r: 2, _tag: "Circle" });
export const either = Val.of<Shape>({ side: 3, _tag: "Square" });
