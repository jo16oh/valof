import { Val } from "valof";
// valof-lint-disable no-unused-member

const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
