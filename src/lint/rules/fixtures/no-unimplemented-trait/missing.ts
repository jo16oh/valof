import { Trait, Val, type TraitCompanion } from "valof";
type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;

export type User = Val<"User", Record<never, never>, Greetable>;
export const User = Val.companion<User>().build();

export type Admin = Val<"Admin", Record<never, never>, Greetable & Named>;
export const Admin = Val.companion<Admin>().implTrait(Greetable, () => ({})).build();

export type Guest = Val<"Guest", Record<never, never>, Named>;

declare const Greetable: TraitCompanion<Greetable>;
