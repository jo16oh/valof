import { Val } from "valof";
// valof-lint-disable-all-whole-file

const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
