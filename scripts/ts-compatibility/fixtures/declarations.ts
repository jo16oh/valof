// Exports the book does not show. Each inferred type references a type or key no entry exports, so
// its `.d.ts` emits only when the package exposes that type by a path a consumer can import, or
// when the type is written by an exported name.
import { Val, type PrivateCreate, type PrivateSeal, type Rec, type Unpatchable } from "valof";
import { Enum, Tag, Trait, type Final, type Self } from "valof/experimental";

export type Greetable = Trait<
  "Greetable",
  { name: string },
  { greet: (self: Self) => string; shout: Final<(self: Self) => string> }
>;
export const greetableBuilder = Trait.companion<Greetable>().impl(() => ({
  greet: (g) => g.name,
  shout: (g) => g.name.toUpperCase(),
}));
export const Greetable = greetableBuilder.build();

export type User = Val<"User", { id: string; name: string }, Greetable>;
export const userBuilder = Val.companion<User>().implTrait(Greetable);
export const User = userBuilder.build();
export const user = User.seal({ id: "a", name: "alice" });
export const boxed = Greetable.dyn(User, user);
export const partial = (u: User): Partial<User> => u;

export type Session = Val<"Session", { id: string; token: string }>;
export const Session = Val.companion<Session, [PrivateSeal, Unpatchable<"id">]>()
  .implCreate(() => ({ id: crypto.randomUUID(), token: "t" }))
  .build();
export const Unsealed = Val.companion<Session>()
  .implCreate.noseal(() => ({ id: "s", token: "t" }))
  .build();

export type Token = Val<"Token", { value: string }>;
export const Token = Val.companion<Token, [PrivateCreate]>().build();

export type Tree = Val<"Tree", { value: number; children: Rec<Tree>[] }>;
export const Tree = Val.companion<Tree>().build();
export const children = (tree: Tree) => tree.children;

export type Shape = Enum<"Shape", { Circle: { r: number }; Rect: { w: number } }, Greetable>;
export const shapeBuilder = Enum.companion<Shape>()
  .Circle.impl(() => ({ diameter: (c) => c.r * 2 }))
  .implTrait(Greetable, () => ({ greet: (s) => s._tag }));
export const Shape = shapeBuilder.build();
export const byTag = Shape[Tag];
export const circle = Shape.Circle;
