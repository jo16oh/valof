import { Enum, Val } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>().build();

const { Circle, Square: Round } = Shape;
const Square = Shape.Square;
const match = Shape.match;

type Point = Val<"Point", { x: number }>;
const Point = Val.companion<Point>().build();
const { seal } = Point;

export const used = [Circle, Round, Square, match, seal];
