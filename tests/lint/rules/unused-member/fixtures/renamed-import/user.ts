import { Val } from "valof";
export const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.name.toUpperCase(),
})).build();

type User = Val<"User", string>;
