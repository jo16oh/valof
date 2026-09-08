export const User = Val.sealer<User>().impl({ greet: (u) => u.name });

const method = "greet";
User[method](user);
