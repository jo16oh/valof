import { Enum, Val, type VariantOf } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Circle = Val.companion<VariantOf<Shape, "Circle">>().build();

export const built = [Circle];
