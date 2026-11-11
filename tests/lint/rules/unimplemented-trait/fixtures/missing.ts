import { Trait, Val, type TraitCompanion } from "valof";
type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;

export type User = Val<"User", { name: string }, Greetable>;
export const User = Val.companion<User>().build();

export type Admin = Val<"Admin", { name: string }, Greetable & Named>;
export const Admin = Val.companion<Admin>().implTrait(Greetable, () => ({})).build();

export type Guest = Val<"Guest", { name: string }, Named>;

declare const Greetable: TraitCompanion<Greetable>;
