import { Greetable as Friendly } from "./traits.ts";
import * as traits from "./traits.ts";

export type User = Val<"User", { name: string }, Friendly & traits.Named>;
export const User = Val.companion<User>().implTrait(Friendly).implTrait<traits.Named>({});
