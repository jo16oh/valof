export const User = Val.companion<User>().impl(() => ({ greet: (u) => u.name })).build();

const method = "greet";
User[method](user);
