import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
});

User.greet(User({ id: "a", name: "bob" }));
