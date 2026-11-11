import { Enum } from "valof";

// @ts-expect-error -- an index signature names no variant
export type Shape = Enum<"Shape", Record<string, { n: number }>>;
// @ts-expect-error -- an index signature declares no variant the companion can build
export const Shape = Enum.companion<Shape>().build();

const Round = Shape.Circle;

export const drawn = [Round];
