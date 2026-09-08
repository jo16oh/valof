const User = Val.sealer<User>().impl({
  // valof-lint-disable-next-line duplicate-brand
  shout: (u) => u.toUpperCase(),
});
