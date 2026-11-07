import { Trait } from "valof";
export type Shared = Trait<"a/Shared", {}>;
export const Shared = Trait.companion<Shared>().build();
