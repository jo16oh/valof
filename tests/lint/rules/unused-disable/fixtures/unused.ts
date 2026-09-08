const User = Val.sealer<User>().impl({
  // valof-lint-disable-next-line unused-member
  shout: (u) => u.toUpperCase(),
});

User.shout;
