const User = Val.sealer<User>().impl({
  // valof-lint-disable-next-line

  // another linter's note, in a block of its own
  shout: (u) => u.toUpperCase(),
});
