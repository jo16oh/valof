import { Val } from "valof";

export type User = Val<"User", { id: string; name: string }>;

export const User = Val.companion<User>();
