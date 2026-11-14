import { Val } from "valof";
const seal = Val.companion<User>();

export const User = seal.impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.id,
})).build();

User.greet(user);

type User = Val<"User", { id: string; name: string; title: string }>;
declare const user: User;
