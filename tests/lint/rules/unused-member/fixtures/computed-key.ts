import { Val } from "valof";
export const User = Val.companion<User>().impl(() => ({ greet: (u) => u.name })).build();

const method = "greet";
User[method](user);

type User = Val<"User", string>;
declare const user: User;
