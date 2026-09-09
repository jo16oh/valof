import { Val as Value } from "valof";

import type { User } from "./type.ts";

const User = Value.sealer<User>().impl({
  greet: (u) => u.name,
});

export const greet = (u: User): string => User.greet(u);
