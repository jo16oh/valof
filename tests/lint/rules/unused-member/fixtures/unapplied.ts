const User = Val.companion<User>().impl({
  greet: (u) => u.name,
}).build();

pipe(user, User.greet);
