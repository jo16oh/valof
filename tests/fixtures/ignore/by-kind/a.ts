const User = Val.sealer<User>().impl({
  // valof-lint-disable-next-line unused-member -- kept for the public API
  shout: (u) => u.toUpperCase(),
});
