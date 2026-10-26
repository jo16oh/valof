const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line unused-member, duplicate-brand
  shout: (u) => u.toUpperCase(),
})).build();
