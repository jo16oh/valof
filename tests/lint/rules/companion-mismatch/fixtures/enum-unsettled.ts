import { Enum } from "valof/experimental";

export type Shape = Enum<"Shape", Record<string, { n: number }>>;
export const Shape = Enum.sealer<Shape>();

const Round = Shape.Circle;

export const drawn = [Round];
