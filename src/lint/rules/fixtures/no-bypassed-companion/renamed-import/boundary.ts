import { Val } from "valof";

import { type User as Account, User as Companion } from "./user.ts";

export const greet = (raw: { id: string; name: string }): string =>
  Companion.greet(Val.of<Account>(raw));
