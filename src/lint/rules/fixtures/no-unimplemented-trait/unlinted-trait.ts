import { Val } from "valof";
import type { Greetable } from "./imports/traits.ts";

export type User = Val<"User", Record<never, never>, Greetable>;
export const User = Val.companion<User>().build();
