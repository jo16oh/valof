import { Trait } from "valof";
export type Shared = Trait<"Shared", {}>;
export const Shared = Trait.companion<Shared>().build();
