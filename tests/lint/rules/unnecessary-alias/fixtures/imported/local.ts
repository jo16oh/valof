import { User } from "./user.ts";

export type Account = User;

export const label = (a: Account): string => User.greet(a);
