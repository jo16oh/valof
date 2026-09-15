import * as a from "./a.ts";
import * as b from "./b.ts";

type NamespaceUser = Val<"NamespaceUser", {}, a.Shared & b.Shared>;
const NamespaceUser = Val.companion<NamespaceUser>().implTrait(a.Shared);
