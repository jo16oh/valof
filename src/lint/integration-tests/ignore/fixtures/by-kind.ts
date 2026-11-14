import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line no-unused-member -- kept for the public API
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
