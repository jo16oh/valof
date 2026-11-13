import type { Trait, Val } from "valof";

export type Account = (Val<"User", { id: string }>);
export type Friendly = ((Trait<"Greetable", { name: string }>));
