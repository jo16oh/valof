import { Trait as T, Val, type Self } from "valof";
import * as lib from "valof";

export type Friendly = T<"Friendly", {}, { greet: (self: Self) => string }>;
export const Friendly = T.companion<Friendly>().impl(() => ({ greet: (f) => "hello" })).build();

export type Named = lib.Trait<"Named", {}, { name: (self: Self) => string }>;
export const Named = lib.Trait.companion<Named>().impl(() => ({ name: (n) => "name" })).build();

export type User = Val<"User", {}, Friendly & Named>;
export const User = Val.companion<User>().implTrait(Friendly, () => ({})).implTrait(Named, () => ({})).build();
