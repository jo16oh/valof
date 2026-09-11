import { Shared as A } from "./a.ts";
import { Shared as B } from "./b.ts";

type RenamedUser = Val<"RenamedUser", {}, A & B>;
const RenamedUser = Val.companion<RenamedUser>().implTrait(A);
