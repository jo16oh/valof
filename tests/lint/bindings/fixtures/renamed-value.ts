import { Val as V } from "valof";

const User = V.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.id,
}));

User.greet(user);

type User = Val<"User", string>;
declare const user: User;
