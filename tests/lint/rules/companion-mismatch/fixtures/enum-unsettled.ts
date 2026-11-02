import { Enum } from "valof";

export type Shape = Enum<"Shape", Record<string, { n: number }>>;
// @ts-expect-error -- an index signature declares no variant the companion can hold
export const Shape = Enum.companion<Shape>().build();

const Round = Shape.Circle;

export const drawn = [Round];
