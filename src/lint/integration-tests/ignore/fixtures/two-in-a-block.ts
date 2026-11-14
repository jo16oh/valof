import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line no-unused-member
  // valof-lint-disable-next-line no-brand-mismatch
  shout: (u) => u.toUpperCase(),
  // valof-lint-disable-next-line no-brand-mismatch
  // valof-lint-disable-next-line no-unused-member
  whisper: (u) => u.toLowerCase(),
})).build();

type User = Val<"User", string>;
