// valof-lint-disable-all-whole-file

const User = Val.companion<User>().impl({
  shout: (u) => u.toUpperCase(),
});
