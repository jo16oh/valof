import { Val } from "valof";

export type User = Val<"User", { name: string }>;
export const User = Val.companion<User>()
  .impl(() => ({ greet: (u) => u.name }))
  .build();

export const read = [User.greet];
