// What `Enum` costs: the union derived from the declaration, `match`'s narrowing and its
// exhaustiveness, a variant's own members, a trait implemented over the union, and a variant
// nested in a Val, which is where the patch boundary runs.
import { Val, type Patch, type PayloadOf } from "valof";
import { Enum, Trait, type Dyn, type Self, type Tag, type VariantOf } from "valof/experimental";

type Shape = Enum<
  "Shape",
  {
    Circle: { r: number };
    Square: { side: number };
    Rect: { w: number; h: number };
    Poly: { at: readonly (readonly [number, number])[] };
  },
  { id: string }
>;
const Shape = Enum.companion<Shape>()
  .implVariant(() => ({
    Circle: { diameter: (c) => c.r * 2 },
    Rect: { ratio: (r) => r.w / r.h },
  }))
  .impl((self) => ({
    area: (s) =>
      self.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
        Rect: (r) => r.w * r.h,
        Poly: (p) => p.at.length,
      }),
  }));

type Named = Trait<"Named", { id: string }, { label: (self: Self, sep: string) => string }>;
const Named = Trait.companion<Named>();

type Event = Enum<
  "Event",
  Tag<"kind"> & { Click: { x: number; y: number }; Key: { code: string } },
  { id: string } & Named
>;
const Event = Enum.companion<Event>("kind").implTrait(Named, (self) => ({
  label: (e, sep) => self.match(e, { Click: (c) => `${c.x}${sep}${c.y}`, Key: (k) => k.code }),
}));

type Frame = Val<"Frame", { id: string; shape: Shape; last: Event }>;
const Frame = Val.sealer<Frame>();

declare const shape: Shape;
declare const patch: Patch<PayloadOf<Frame>>;

const circle = Shape.Circle({ id: "c", r: 2 });
const frame = Frame({ id: "f", shape: circle, last: Event.Click({ id: "e", x: 1, y: 2 }) });

export const read = [
  Shape.area(shape),
  Shape.Circle.diameter(circle),
  Shape.Rect.ratio(Shape.Rect({ id: "r", w: 1, h: 2 })),
  Shape.match(shape, {
    Circle: (c) => c.r,
    Square: (q) => q.side,
    Rect: (r) => r.w,
    Poly: (p) => p.at.length,
  }),
];

export const derived = [
  Shape.Circle.patch(circle, { r: 3 }),
  Shape.Poly.patch(Shape.Poly({ id: "p", at: [[0, 0]] }), { at: [[1, 1]] }),
  // A variant is a patch boundary: the nested one is replaced, never merged into.
  Frame.patch(frame, { shape: Shape.Square({ id: "s", side: 1 }) }),
  Frame.patch(frame, patch),
];

export const boxed: Dyn<Named>[] = [Named.dyn(Event, frame.last)];
export const labels = boxed.map((b) => b.label("/"));
export const named: VariantOf<Shape, "Circle"> = circle;
