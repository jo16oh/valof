import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
})).build();

pipe(user, User.greet);

type User = Val<"User", { id: string; name: string; title: string }>;
declare const pipe: <A, B>(a: A, f: (a: A) => B) => B;
declare const user: User;
