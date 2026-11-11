import { Val } from "valof";
export const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.name.toUpperCase(),
})).build();

export type User = Val<"User", { id: string; name: string; title: string }>;
