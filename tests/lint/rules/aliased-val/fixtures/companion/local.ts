import { Val } from "valof";

import type { User } from "./user.ts";

type Local = User;

const Local = Val.sealer<Local>().impl({
  shout: (u) => u.name.toUpperCase(),
});

export const shout = (u: Local): string => Local.shout(u);
