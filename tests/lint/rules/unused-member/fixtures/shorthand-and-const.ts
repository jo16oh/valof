const User = Val.companion<User>().impl({
  slug(u) {
    return u.name.toLowerCase();
  },
  MAX: 10,
}).build();
