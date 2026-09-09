import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
});

export const bob = (): string => User.greet(Val.of<User>({ id: "a", name: "bob" }));
