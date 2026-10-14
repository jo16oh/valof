import { Enum, Trait } from "valof/experimental";

const Id = Val.sealer<Id>().impl({
  equals: (a, b) => a === b,
  update: (i) => i,
  match: (i) => i,
  dyn: (i) => i,
  Square: (i) => i,
  dispatch: (i) => i,
  thenable: (i) => i,
  implFoo: (i) => i,
  implTrait: (i) => i,
  __valof_traits: (i) => i,
  __valof_x: (i) => i,
});

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
const Shape = Enum.sealer<Shape>()
  .implVariant("Circle", (variant) =>
    variant.impl({ match: (c) => c, Square: (c) => c, patch: (c) => c }),
  )
  .impl({ sides: () => 4, dyn: (s) => s, match: (s) => s, seal: (s) => s, Square: (s) => s });

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
});
