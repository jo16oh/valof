import { Trait } from "valof";
export type Shared = Trait<"b/Shared", {}>;
export const Shared = Trait.companion<Shared>().build();
