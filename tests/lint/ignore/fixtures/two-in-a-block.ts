import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line unused-member
  // valof-lint-disable-next-line brand-mismatch
  shout: (u) => u.toUpperCase(),
})).build();
