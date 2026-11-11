import { Enum } from "valof";

export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export const Shape = Enum.companion<Shape>()
  .Circle.implSeal((c, seal) => seal(c))
  .Square.impl(() => ({ perimeter: (s) => s.side * 4 }))
  .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
  .build();

export type Coin = Enum<"Coin", { Heads: { at: number }; Tails: { at: number } }>;
export const Coin = Enum.companion<Coin>()
  .Heads.implSeal((h, seal) => seal(h))
  .Heads.impl(() => ({ up: (h) => h.at }))
  .Tails.impl(() => ({ down: (t) => t.at }))
  .build();

export const read = [Shape.Circle.diameter, Shape.Square.perimeter, Coin.Heads.up, Coin.Tails.down];
