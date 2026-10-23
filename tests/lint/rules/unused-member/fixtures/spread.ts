const base = { greet: (u) => u.name };

export const User = Val.companion<User>().impl({ ...base }).build();
