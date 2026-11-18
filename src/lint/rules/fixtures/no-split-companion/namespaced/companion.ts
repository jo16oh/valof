import { Val } from "valof";

import type * as types from "./type.ts";

const User = Val.companion<types.User>().impl(() => ({
  greet: (u) => u.name,
})).build();

export const greet = (u: types.User): string => User.greet(u);
