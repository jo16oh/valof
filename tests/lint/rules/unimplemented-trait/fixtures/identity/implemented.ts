import * as a from "./a.ts";
import * as b from "./b.ts";

type CompleteUser = Val<"CompleteUser", {}, a.Shared & b.Shared>;
const CompleteUser = Val.companion<CompleteUser>()
  .implTrait(a.Shared)
  .implTrait(b.Shared);
