import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
})).build();

pipe(user, User.greet);

type User = Val<"User", { id: string; name: string; title: string }>;
declare const pipe: unknown;
declare const user: User;
