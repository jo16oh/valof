import { Enum, Val, type VariantOf } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>().build();

export const circle = Val.of<VariantOf<Shape, "Circle">>({ r: 2, _tag: "Circle" });
// @ts-expect-error -- `Val.of` builds one Val, and `Shape` is a union of variants
export const either = Val.of<Shape>({ side: 3, _tag: "Square" });
