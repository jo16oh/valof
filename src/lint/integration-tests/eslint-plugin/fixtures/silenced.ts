import { Val } from "valof";

export type User = Val<"User", { id: string }>;

// valof-lint-disable-next-line no-unused-member -- nothing to silence here
export const User = Val.companion<User>().build();
