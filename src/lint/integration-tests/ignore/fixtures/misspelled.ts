import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-nextline
  shout: (u) => u.toUpperCase(),
  // xvalof-lint-disable-next-line
  whisper: (u) => u.toLowerCase(),
})).build();

type User = Val<"User", string>;
