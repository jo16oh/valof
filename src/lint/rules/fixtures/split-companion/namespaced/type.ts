import type { Val } from "valof";

export type User = Val<"User", { id: string; name: string }>;
