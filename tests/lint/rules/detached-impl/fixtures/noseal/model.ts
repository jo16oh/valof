import { Val } from "valof";

export type Age = Val<"Age", number>;
export const Age = Val.companion<Age>().implSeal((n, seal) => seal(Math.trunc(n)));
