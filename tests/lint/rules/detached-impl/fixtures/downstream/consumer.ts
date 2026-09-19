import { User } from "./model.ts";

export const Extended = User.impl({ shout: (u) => u.id.toUpperCase() });
