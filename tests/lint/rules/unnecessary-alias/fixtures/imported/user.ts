import { Val } from "valof";

export type User = Val<"User", { id: string; name: string }>;

export const User = Val.sealer<User>().impl({
  greet: (u) => u.name,
});
