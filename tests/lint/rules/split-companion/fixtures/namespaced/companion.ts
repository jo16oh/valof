import { Val } from "valof";

import type * as types from "./type.ts";

const User = Val.sealer<types.User>().impl({
  greet: (u) => u.name,
});

export const greet = (u: types.User): string => User.greet(u);
