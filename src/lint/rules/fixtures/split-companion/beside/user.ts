import { Val } from "valof";

export type User = Val<"User", { id: string; name: string }>;

export const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
})).build();

User.greet(User.seal({ id: "a", name: "bob" }));
