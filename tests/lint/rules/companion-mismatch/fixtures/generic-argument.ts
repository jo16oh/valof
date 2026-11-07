import { Enum, Val, type VariantOf } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

// @ts-expect-error -- a variant is built by its enum's companion
const Circle = Val.companion<VariantOf<Shape, "Circle">>().build();

export const built = [Circle];
