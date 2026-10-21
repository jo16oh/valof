// valof-lint-disable-whole-file duplicate-brand

const User = Val.companion<User>().impl({
  // valof-lint-disable-next-line unused-member
  shout: (u) => u.toUpperCase(),
});
