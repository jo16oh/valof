// valof-lint-disable-all-whole-file

const User = Val.sealer<User>().impl({
  shout: (u) => u.toUpperCase(),
});
