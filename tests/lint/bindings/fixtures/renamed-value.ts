import { Val as V } from "valof";

const User = V.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.id,
}));

User.greet(user);

type User = V<"User", { id: string; name: string }>;
declare const user: User;
