const User = Val.companion<User>().impl(() => ({
  // valof-lint-disable-next-line duplicate-brand
  shout: (u) => u.toUpperCase(),
})).build();
