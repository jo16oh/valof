import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

export const user: User = Val.of({ id: "a", name: "bob" });
