import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  /** Shouts the name. */
  // valof-lint-disable-next-line no-unused-member
  // oxlint-disable-next-line no-unused-vars
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
