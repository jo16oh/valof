// What `Enum` costs: the union derived from the declaration, `match`'s narrowing and its
// exhaustiveness, `_` taking the rest, `match` on a tag alone, a variant's own members, a seal on
// the enum and one on a variant, a trait implemented over the union, and a variant nested in a
// Val, where the patch boundary runs.
import { Val, type Patch, type SeedOf } from "valof";
import { Enum, Tag, Trait, type Dyn, type Self, type VariantOf } from "valof/experimental";

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
  .Circle.impl({ diameter: (c) => c.r * 2 })
  .Rect.impl({ ratio: (r) => r.w / r.h })
  .impl({
    area: (s): number =>
      Shape.match(s, {
        Circle: (c) => Math.PI * c.r * c.r,
        Square: (q) => q.side * q.side,
        Rect: (r) => r.w * r.h,
        Poly: (p) => p.at.length,
      }),
  })
  .build();

type Named = Trait<"Named", { id: string }, { label: (self: Self, sep: string) => string }>;
const Named = Trait.companion<Named>().build();

type Event = Enum<
  "Event",
  { Click: { x: number; y: number }; Key: { code: string } },
  Tag<"kind"> & { id: string } & Named
>;
const Event = Enum.companion<Event>()
  .tag("kind")
  .Key.implSeal((k, seal) => (k.code ? seal(k) : new RangeError("code must not be empty")))
  .implSeal((e, seal) => (e.id ? seal(e) : new RangeError("id must not be empty")))
  .implTrait(Named, {
    label: (e, sep): string =>
      Event.match(e, { Click: (c) => `${c.x}${sep}${c.y}`, Key: (k) => k.code }),
  })
  .build();

type Frame = Val<"Frame", { id: string; shape: Shape; last: Event }>;
const Frame = Val.companion<Frame>().build();

declare const shape: Shape;
declare const patch: Patch<SeedOf<Frame>>;

const circle = Shape.Circle.seal({ _tag: "Circle", id: "c", r: 2 });
const click = Event.Click.create({ id: "e", x: 1, y: 2 }) as VariantOf<Event, "Click">;
const frame = Frame.seal({ id: "f", shape: circle, last: click });

export const read = [
  Shape.area(shape),
  Shape.Circle.diameter(circle),
  Shape.Rect.ratio(Shape.Rect.create({ id: "r", w: 1, h: 2 })),
  Shape.match(shape, {
    Circle: (c) => c.r,
    Square: (q) => q.side,
    Rect: (r) => r.w,
    Poly: (p) => p.at.length,
  }),
  Shape.match(shape, { Circle: (c) => c.r, _: (rest) => rest._tag }),
];

export const derived = [
  Shape.Circle.patch(circle, { r: 3 }),
  Shape.Poly.patch(Shape.Poly.create({ id: "p", at: [[0, 0]] }), { at: [[1, 1]] }),
  // A variant is a patch boundary: the nested one is replaced, never merged into.
  Frame.patch(frame, { shape: Shape.Square.create({ id: "s", side: 1 }) }),
  Frame.patch(frame, patch),
];

export const sealed = Event.seal({ kind: "Key", id: "e", code: "a" });
export const byTag = Event[Tag].match(Math.random() > 0.5 ? "Key" : "Click", {
  Key: () => Event.Key.create({ id: "e", code: "a" }),
  Click: () => Event.Click.create({ id: "e", x: 0, y: 0 }),
});

export const boxed: Dyn<Named>[] = [Named.dyn(Event, frame.last)];
export const labels = boxed.map((b) => b.label("/"));
export const named: VariantOf<Shape, "Circle"> = circle;
