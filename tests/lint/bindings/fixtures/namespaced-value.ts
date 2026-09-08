import * as valof from "valof";

const User = valof.Val.sealer<User>().impl({
  greet: (u) => u.name,
  shout: (u) => u.id,
});

User.greet(user);
