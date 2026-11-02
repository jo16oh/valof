import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.toUpperCase(),
})).build();

User.shout(u);

type User = Val<"User", string>;
declare const u: User;
