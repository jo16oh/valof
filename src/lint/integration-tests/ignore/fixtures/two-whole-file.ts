import { Val } from "valof";
// valof-lint-disable-whole-file no-brand-mismatch
// valof-lint-disable-whole-file no-unused-member

export type OrderId = Val<"Id", string>;

const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
