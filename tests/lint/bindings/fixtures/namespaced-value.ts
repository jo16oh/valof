import * as valof from "valof";

const User = valof.Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.id,
})).build();

User.greet(user);

type User = Val<"User", string>;
declare const user: User;
