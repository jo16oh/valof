import { Val } from "valof";

import type { User } from "./type.ts";

const User = Val.companion<User>().impl({
  greet: (u) => u.name,
}).build();

export const greet = (u: User): string => User.greet(u);
