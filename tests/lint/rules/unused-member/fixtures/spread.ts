import { Val } from "valof";
const base = { greet: (u: User) => u.toUpperCase() };

export const User = Val.companion<User>().impl(() => ({ ...base })).build();

type User = Val<"User", string>;
