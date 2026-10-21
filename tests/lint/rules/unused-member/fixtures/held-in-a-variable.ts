const seal = Val.companion<User>();

export const User = seal.impl({
  greet: (u) => u.name,
  shout: (u) => u.id,
});

User.greet(user);
