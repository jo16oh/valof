import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const seal = Val.companion<User>();

const User = seal.impl({
  greet: (u) => u.name,
}).build();

User.greet(User.seal({ id: "a", name: "bob" }));
