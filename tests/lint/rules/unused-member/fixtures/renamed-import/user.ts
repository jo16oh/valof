export const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
  shout: (u) => u.name.toUpperCase(),
});
