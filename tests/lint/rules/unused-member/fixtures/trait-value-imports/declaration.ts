import { Trait as T, Val } from "valof";
import * as lib from "valof";

export type Friendly = T<"Friendly", {}, { greet: () => string }>;
export const Friendly = T.companion<Friendly>().impl({ greet: () => "hello" });

export type Named = lib.Trait<"Named", {}, { name: () => string }>;
export const Named = lib.Trait.companion<Named>().impl({ name: () => "name" });

export type User = Val<"User", {}, Friendly & Named>;
export const User = Val.companion<User>().implTrait(Friendly).implTrait(Named);
