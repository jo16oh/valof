const User = Val.sealer<User>().impl({
  /** Shouts the name. */
  // valof-lint-disable-next-line unused-member
  // oxlint-disable-next-line no-unused-vars
  shout: (u) => u.toUpperCase(),
});
