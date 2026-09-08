const User = Val.sealer<User>().impl({
  // valof-lint-disable-next-line
  shout: (u) => u.toUpperCase(),
});
