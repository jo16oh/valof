import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const seal = Val.companion<User>();

const User = seal.impl({
  greet: (u) => u.name,
});

User.greet(User.seal({ id: "a", name: "bob" }));
