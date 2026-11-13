import type { User } from "./user.ts";

export const shout: (u: User, mark: string) => string = (u, mark = "!") => u.name + mark;
