import { Enum } from "valof";

export type Shape = Enum<"Shape", Record<string, { n: number }>>;
export const Shape = Enum.companion<Shape>().build();

const Round = Shape.Circle;

export const drawn = [Round];
