import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
})).build();

User.greet(User.seal({ id: "a", name: "bob" }));
