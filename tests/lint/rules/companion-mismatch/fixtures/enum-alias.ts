import { Enum } from "valof/experimental";

type Variants = { Circle: { r: number }; Square: { side: number } };

export type Shape = Enum<"Shape", Variants>;
export const Shape = Enum.sealer<Shape>();

const Round = Shape.Circle;

export const drawn = [Round];
