import { Enum } from "valof";

type Variants = { Circle: { r: number }; Square: { side: number } };

export type Shape = Enum<"Shape", Variants>;
export const Shape = Enum.companion<Shape>().build();

const Round = Shape.Circle;

export const drawn = [Round];
