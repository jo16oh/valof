import { Val } from "valof";

type Age = Val<"Age", number>;

const Age = Val.companion<Age>()
  .implSeal((n, seal) => seal(Math.trunc(n)))
  .implCreate.noseal(() => 0).build();

export const zero = (): Age => Val.of<Age>(0);
