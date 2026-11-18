import { Val } from "valof";
import { Greetable as Friendly } from "./traits.ts";
import * as traits from "./traits.ts";

export type User = Val<"User", Record<never, never>, Friendly & traits.Named>;
export const User = Val.companion<User>().implTrait(Friendly).implTrait(traits.Named).build();
