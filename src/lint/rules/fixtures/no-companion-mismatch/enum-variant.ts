import { Enum } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>().build();

const { Circle, Square: Round } = Shape;
const Disc = Shape.Circle;
const held = Shape.match;

const config = { value: 1 };
const setting = config.value;

export const drawn = [Circle, Round, Disc, held, setting];
