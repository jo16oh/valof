// Checked by `vp lint`, not run. `oxlint.config.ts` allows Valof's brand class in
// `no-misused-spread`, from the source and from the published package, and an unused disable
// comment fails the run. Each line therefore pins whether the rule reports it.
import type { Val as Published } from "#valof";
import type { Dyn, Enum, Impl, Self, Trait, Val, VariantOf } from "../src/index.ts";

type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;

export const published = (u: Published<"User", { id: string }>) => ({ ...u });
export const val = (u: Val<"User", { id: string }>) => ({ ...u });
export const variant = (c: VariantOf<Shape, "Circle">) => ({ ...c });
export const traitDeclaring = (p: Val<"Person", { id: string }, Greetable>) => ({ ...p });

// Oxlint does not split a union to match it, unlike typescript-eslint.
// oxlint-disable-next-line typescript/no-misused-spread
export const union = (s: Shape) => ({ ...s });
// oxlint-disable-next-line typescript/no-misused-spread
export const trait = (g: Impl<Greetable>) => ({ ...g });
// A box loses its members.
// oxlint-disable-next-line typescript/no-misused-spread
export const dyn = (d: Dyn<Greetable>) => ({ ...d });
