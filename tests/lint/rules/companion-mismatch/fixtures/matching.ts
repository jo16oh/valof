import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const User = Val.companion<User>().impl({
  greet: (u) => u.name,
});

User.greet(User.seal({ id: "a", name: "bob" }));
