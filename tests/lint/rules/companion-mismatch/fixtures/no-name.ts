import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const { greet } = Val.companion<User>().impl({
  greet: (u) => u.name,
});

export const shout = (u: User): string => greet(u).toUpperCase();
