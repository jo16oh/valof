const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
  shout: (u) => u.id,
});

export { User as Public };
