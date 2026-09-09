import { User } from "./user.ts";

export type Account = User;
export type Customer = Account;

export const label = (c: Customer): string => User.greet(c);
