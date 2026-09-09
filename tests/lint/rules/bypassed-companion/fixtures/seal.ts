import { Val } from "valof";

type Age = Val<"Age", number>;

const Age = Val.companion<Age>().implSeal((n, seal) => seal(Math.trunc(n)));

export const zero = (): Age => Val.of<Age>(0);
