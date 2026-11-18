import { Val } from "valof";

import type { User } from "./user.ts";

type Local = User;

const Local = Val.companion<Local>().impl(() => ({
  shout: (u) => u.name.toUpperCase(),
})).build();

export const shout = (u: Local): string => Local.shout(u);
