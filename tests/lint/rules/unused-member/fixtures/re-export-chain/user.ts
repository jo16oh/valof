const User = Val.companion<User>().impl({
  greet: (u) => u.name,
  shout: (u) => u.id,
});

export { User as Public };
