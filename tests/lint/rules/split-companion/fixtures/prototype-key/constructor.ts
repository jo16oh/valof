import { Val } from "valof";

export type constructor = Val<"constructor", { id: string }>;

export const constructor = Val.companion<constructor>().build();
