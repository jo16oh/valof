const User = Val.sealer<User>().impl({
  slug(u) {
    return u.name.toLowerCase();
  },
  MAX: 10,
});
