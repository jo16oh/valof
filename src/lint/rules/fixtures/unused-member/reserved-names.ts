import { Enum, Trait, Val, type Self } from "valof";

const Id = Val.companion<Id>().impl(() => ({
  equals: (a, b) => a === b,
  update: (i) => i,
  match: (i) => i,
  dyn: (i) => i,
  Square: (i) => i,
  dispatch: (i) => i,
  thenable: (i) => i,
  implTrait: (i) => i,
})).build();

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>()
  .Circle.impl(() => ({
    match: (c) => c,
    Square: (c) => c,
    // @ts-expect-error -- a name the library reserves
    patch: (c) => c,
  }))
  .impl(() => ({
    sides: (s) => 4,
    dyn: (s) => s,
    // @ts-expect-error -- a name the library reserves
    match: (s) => s,
    // @ts-expect-error -- a name the library reserves
    seal: (s) => s,
    // @ts-expect-error -- a name the library reserves
    Square: (s) => s,
  }))
  .build();

type Named = Trait<
  "Named",
  { name: string },
  { greet: (self: Self) => string; match: (self: Self) => number }
>;
const Named = Trait.companion<Named>().impl(() => ({
  greet: (n) => n.name,
  match: (n) => 0,
  // @ts-expect-error -- the name the trait itself uses
  dyn: () => 0,
  // @ts-expect-error -- not a member the trait declares
  then: () => 0,
})).build();

type Id = Val<"Id", string>;
