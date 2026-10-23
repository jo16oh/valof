import { Val } from "valof";

type Age = Val<"Age", number>;

const Age = Val.companion<Age>()
  .implCreate.noseal(() => 0)
  .implSeal((n, seal) => seal(Math.trunc(n))).build();

export const zero = (): Age => Val.of<Age>(0);
