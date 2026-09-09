import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const seal = Val.sealer<User>();

const User = seal.impl({
  greet: (u) => u.name,
});

User.greet(User({ id: "a", name: "bob" }));
