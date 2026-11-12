import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
