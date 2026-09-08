// valof-lint-disable unused-member

const User = Val.sealer<User>().impl({
  shout: (u) => u.toUpperCase(),
});
