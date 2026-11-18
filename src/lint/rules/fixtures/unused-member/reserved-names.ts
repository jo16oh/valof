import { Enum, Trait, Val, type Self } from "valof";
import * as valof from "valof";
import { Val as V } from "valof";

const Id = Val.companion<Id>().impl(() => ({
  equals: (a, b) => a === b,
  update: (i) => i,
  match: (i) => i,
  dyn: (i) => i,
  Square: (i) => i,
  dispatch: (i) => i,
  thenable: (i) => i,
  implTrait: (i) => i,
  set: (i) => i,
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

type Tags = Val.Record<"Tags", string, true>;
const Tags = Val.Record.companion<Tags>()
  .impl(() => ({
    // @ts-expect-error -- a record's own member
    has: (t: Tags) => true,
    // @ts-expect-error -- a record's own member
    set: (t: Tags) => t,
    // @ts-expect-error -- a record's own member
    delete: (t: Tags) => t,
    count: (t: Tags) => 0,
  }))
  .implAssoc(() => ({
    // @ts-expect-error -- a record's own member
    fromEntries: () => 0,
    // @ts-expect-error -- a record's own member
    keys: () => 0,
    // @ts-expect-error -- a record's own member
    values: () => 0,
    // @ts-expect-error -- a record's own member
    entries: () => 0,
  }))
  .build();

type Held = Val.Record<"Held", string, true>;
const held = V.Record.companion<Held>();
const Held = held
  .impl(() => ({
    // @ts-expect-error -- a record's own member
    has: (t: Held) => true,
    size: (t: Held) => 0,
  }))
  .build();

type Spelled = Val.Record<"Spelled", string, true>;
const Spelled = valof.Val.Record.companion<Spelled>()
  .impl(() => ({
    // @ts-expect-error -- a record's own member
    keys: (t: Spelled) => [],
    size: (t: Spelled) => 0,
  }))
  .build();

type Plain = Val<"Plain", string>;
const plain = Val.companion<Plain>();
const Plain = plain.impl(() => ({ set: (p: Plain) => p })).build();

type Id = Val<"Id", string>;
