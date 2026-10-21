const User = Val.companion<User>().impl({
  greet: (u) => u.name,
});

pipe(user, User.greet);
