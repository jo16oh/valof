// valof-lint-disable unused-member

const User = Val.companion<User>().impl({
  shout: (u) => u.toUpperCase(),
}).build();
