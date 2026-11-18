import { Trait, Val, type TraitCompanion } from "valof";
type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;

export type User = Val<"User", Record<never, never>, Greetable & (Named)>;
export const User = Val.companion<User>().implTrait(Greetable, () => ({})).build();

type Behaviours = (Greetable & Named);
export type Admin = Val<"Admin", Record<never, never>, Behaviours>;
export const Admin = Val.companion<Admin>().implTrait(Greetable, () => ({})).build();

declare const Greetable: TraitCompanion<Greetable>;
