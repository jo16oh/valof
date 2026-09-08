const User = Val.sealer<User>().impl({
  // valof-lint-disable-nextline
  shout: (u) => u.toUpperCase(),
});
