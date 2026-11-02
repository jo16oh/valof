import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-nextline
  shout: (u) => u.toUpperCase(),
})).build();
