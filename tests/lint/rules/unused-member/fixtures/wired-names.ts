import { Enum } from "valof/experimental";

const Id = Val.sealer<Id>().impl({
  equals: (a, b) => a === b,
  update: (i) => i,
  patch: (i) => i,
  seal: (i) => i,
  create: (i) => i,
});

const Shape = Enum.sealer<Shape>().implVariant("Circle", (variant) =>
  variant.impl({ equals: (a, b) => a === b, patch: (c) => c }),
);
