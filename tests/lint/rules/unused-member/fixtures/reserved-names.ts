import { Enum, Trait } from "valof/experimental";

const Id = Val.companion<Id>().impl({
  equals: (a, b) => a === b,
  update: (i) => i,
  match: (i) => i,
  dyn: (i) => i,
  Square: (i) => i,
  dispatch: (i) => i,
  thenable: (i) => i,
  implTrait: (i) => i,
  __valof_traits: (i) => i,
  __valof_x: (i) => i,
}).build();

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.companion<Shape>()
  .Circle.impl({ match: (c) => c, Square: (c) => c, patch: (c) => c })
  .impl({ sides: () => 4, dyn: (s) => s, match: (s) => s, seal: (s) => s, Square: (s) => s }).build();

type Named = Trait<
  "Named",
  { name: string },
  { greet: (self: unknown) => string; match: (self: unknown) => number }
>;
const Named = Trait.companion<Named>().impl({
  greet: () => "hi",
  match: () => 0,
  dyn: () => 0,
  then: () => 0,
}).build();
