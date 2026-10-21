import { Val } from "valof";

export type User = Val<"User", { id: string }>;
export const User = Val.companion<User>().impl({ label: (u) => u.id });
