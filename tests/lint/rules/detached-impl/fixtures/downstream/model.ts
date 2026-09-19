import { Val } from "valof";

export type User = Val<"User", { id: string }>;
export const User = Val.sealer<User>().impl({ label: (u) => u.id });
