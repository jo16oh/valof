import { Val } from "valof";
// valof-lint-disable-whole-file no-duplicate-brand

const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line no-unused-member
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
