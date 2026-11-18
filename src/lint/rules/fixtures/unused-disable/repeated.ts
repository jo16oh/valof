import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line unused-member, unused-member
  shout: (u) => u.toUpperCase(),
})).build();

User.shout;

type User = Val<"User", string>;
