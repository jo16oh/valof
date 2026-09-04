const base = { greet: (u) => u.name };

export const User = Val.sealer<User>().impl({ ...base });
