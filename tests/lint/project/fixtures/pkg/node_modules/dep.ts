const User = Val.sealer<User>().impl({
  shout: (u) => u.toUpperCase(),
});
