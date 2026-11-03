// Every state of every builder, each exported with its type inferred. Where a builder's type loses
// its name, the compiler prints the builder's steps again inside each step. The nesting either
// exceeds what the compiler serializes (TS7056) or is truncated to `/*elided*/ any`, which
// `elided()` in `index.ts` rejects.
import { Enum, Tag, Trait, Val, type Final, type Self } from "valof";

export type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; shout: Final<(self: Self) => string> }
>;
export type Plain = Trait<"Plain", { name: string }, { hello: (self: Self) => string }>;

export const traitStart = Trait.companion<Greetable>();
export const traitImpl = traitStart.impl(() => ({ shout: (g) => g.name }));
export const traitImplAssoc = traitImpl.implAssoc(() => ({ a: () => 1 }));
export const traitAssoc = traitStart.implAssoc(() => ({ a: () => 1 }));
const traitAssocImpl = traitAssoc
  .impl(() => ({ shout: (g) => g.name }))
  .implAssoc(() => ({ b: () => 1 }));
export const Greetable = traitAssocImpl.build();
export const Plain = Trait.companion<Plain>().build();

export type User = Val<"User", { id: string; name: string }, Greetable & Plain>;
export const valStart = Val.companion<User>();
export const valSeal = valStart.implSeal((u, seal) => seal(u));
export const valCreate = valSeal.implCreate(() => ({ id: "a", name: "b" }));
export const valNoseal = valSeal.implCreate.noseal(() => ({ id: "a", name: "b" }));
export const valImpl = valCreate.impl(() => ({ rename: (u, name: string) => ({ ...u, name }) }));
export const valTrait = valImpl.implTrait(Greetable, () => ({ greet: (u) => u.name }));
export const valAssoc = valTrait
  .implTrait(Plain, () => ({ hello: (u) => u.name }))
  .implAssoc(() => ({ a: () => 1 }))
  .implAssoc(() => ({ b: () => 1 }));
export const valAssocFirst = valStart.implAssoc(() => ({ a: () => 1 })).impl(() => ({}));
export const User = valAssoc.build();

export type Shape = Enum<"Shape", { Circle: { r: number }; Rect: { w: number } }, Greetable>;
export const enumStart = Enum.companion<Shape>();
export const variantStart = enumStart.Circle;
export const variantSeal = enumStart.Circle.implSeal((c, seal) => seal(c));
export const variantCreate = variantSeal.Circle.implCreate(() => ({ r: 1, name: "c" }));
export const variantNoseal = enumStart.Circle.implCreate.noseal(() => ({ r: 1, name: "c" }));
export const variantImpl = variantCreate.Circle.impl(() => ({ d: (c) => c.r * 2 }));
export const variantAssoc = variantImpl.Circle.implAssoc(() => ({ unit: () => 1 }))
  .Rect.implAssoc(() => ({ a: () => 1 }))
  .Rect.implAssoc(() => ({ b: () => 1 }));
export const variantDone = variantAssoc.Circle;
export const enumSeal = variantAssoc.implSeal((s, seal) => seal(s));
export const enumCreate = enumSeal.implCreate(() => ({ _tag: "Rect" as const, w: 1, name: "r" }));
export const enumNoseal = enumSeal.implCreate.noseal(() => ({
  _tag: "Rect" as const,
  w: 1,
  name: "r",
}));
export const enumImpl = enumCreate.impl(() => ({ tag: (s) => s._tag }));
export const enumTrait = enumImpl.implTrait(Greetable, () => ({ greet: (s) => s.name }));
export const enumAssoc = enumTrait
  .implAssoc(() => ({ a: () => 1 }))
  .implAssoc(() => ({ b: () => 1 }));
export const Shape = enumAssoc.build();

export type Event = Enum<"Event", { Click: { x: number }; Key: { code: string } }, Tag<"kind">>;
export const tagStart = Enum.companion<Event>();
export const tagged = tagStart.tag("kind");
export const Event = tagged.Click.implSeal((c, seal) => seal(c)).build();

export type Animal = Enum<"Animal", { Dog: Plain; Cat: { lives: number } }>;
export const variantTrait = Enum.companion<Animal>().Dog.implTrait(Plain, () => ({
  hello: (d) => d.name,
}));
export const Animal = variantTrait.build();
