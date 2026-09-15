const User = Val.sealer<User>().impl({
  /* valof-lint-disable-next-line */ marker,
  // another linter's note
  shout: (u) => u.toUpperCase(),
});
