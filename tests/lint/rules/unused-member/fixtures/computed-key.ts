import { Val } from "valof";
export const User = Val.companion<User>().impl(() => ({ greet: (u) => u.name })).build();

const method = "greet";
User[method](user);

type User = Val<"User", { id: string; name: string; title: string }>;
declare const user: User;
