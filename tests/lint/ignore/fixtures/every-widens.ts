import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line brand-mismatch
  // valof-lint-disable-next-line
  shout: (u) => u.toUpperCase(),
  // valof-lint-disable-next-line
  // valof-lint-disable-next-line brand-mismatch
  whisper: (u) => u.toLowerCase(),
})).build();
