import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  /* valof-lint-disable-next-line */ marker,
  // another linter's note
  shout: (u) => u.toUpperCase(),
})).build();

type User = Val<"User", string>;
declare const marker: number;
