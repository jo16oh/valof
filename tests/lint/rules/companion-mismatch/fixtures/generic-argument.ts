import { Val } from "valof";
import { Enum, type VariantOf } from "valof/experimental";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;

const Circle = Val.sealer<VariantOf<Shape, "Circle">>();

export const built = [Circle];
