// Checked by `vp lint`, not run. `oxlint.config.ts` allows Valof's brand class in
// `no-misused-spread`, from the source and from the published package, and an unused disable
// comment fails the run. Each line therefore pins whether the rule reports it.
import type { Val as Published } from "#valof";
import type { Dyn, Enum, Impl, Self, Trait, Val, VariantOf } from "../src/index.ts";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;

export function published(u: Published<"User", { id: string }>) {
  return { ...u };
}
export function val(u: Val<"User", { id: string }>) {
  return { ...u };
}
export function variant(c: VariantOf<Shape, "Circle">) {
  return { ...c };
}
export function traitDeclaring(p: Val<"Person", { id: string }, Greetable>) {
  return { ...p };
}

// Oxlint does not split a union to match it, unlike typescript-eslint.
export function union(s: Shape) {
  // oxlint-disable-next-line typescript/no-misused-spread
  return { ...s };
}
export function trait(g: Impl<Greetable>) {
  // oxlint-disable-next-line typescript/no-misused-spread
  return { ...g };
}
// A box loses its members.
export function dyn(d: Dyn<Greetable>) {
  // oxlint-disable-next-line typescript/no-misused-spread
  return { ...d };
}
