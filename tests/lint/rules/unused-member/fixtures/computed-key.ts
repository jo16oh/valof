export const User = Val.companion<User>().impl({ greet: (u) => u.name });

const method = "greet";
User[method](user);
