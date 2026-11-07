import { Enum, Val } from "valof";

type Money = Val<"Money", { cents: number }>;
const Money = Val.companion<Money>()
  .implCreate(() => ({ cents: 0 }))
  .implAssoc(({ seal, create: make }) => ({
    fromCents: (n: number): Money => seal({ cents: n }),
    read: (text: string): Money => seal({ cents: Number(text) }),
    random: (): Money => make(),
    cents: (n: number): Money => Money.fromCents(n),
    sum: (all: readonly Money[]): Money => Money.seal({ cents: all.length }),
    zero: seal({ cents: 0 }),
  }))
  .impl(() => ({
    fromage: (m) => m.cents,
    createdAt: (m) => m.cents,
    fromYears: (m) => m.cents,
  }))
  .build();

export const read = [Money.fromCents, Money.read, Money.random, Money.cents, Money.sum, Money.zero];
export const more = [Money.fromage, Money.createdAt, Money.fromYears];

type Rate = Val<"Rate", { per: number }>;
const Rate = Val.companion<Rate>()
  .implAssoc(({ seal }) => ({
    load: function (n: number) {
      return seal({ per: n });
    },
  }))
  .build();

export const rates = [Rate.load];

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>()
  .Square.impl(() => ({ fromSide: (s) => s.side }))
  .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
  .build();

export const shapes = [Shape.Square.fromSide, Shape.Circle.diameter];
