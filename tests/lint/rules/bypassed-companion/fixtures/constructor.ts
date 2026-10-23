import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User>().impl({
  greet: (u) => u.name,
}).build();

export const bob = (): string => User.greet(Val.of<User>({ id: "a", name: "bob" }));
