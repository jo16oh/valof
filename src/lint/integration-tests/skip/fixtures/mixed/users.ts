import { Val } from "valof";

export type Id = Val<"Id", string>;

export const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.name,
})).build();

type User = Val<"User", { id: string; name: string; title: string }>;
