import { Shared as Named } from "./a.ts";
import * as traits from "./a.ts";

type MixedUser = Val<"MixedUser", {}, Named & traits.Shared>;
const MixedUser = Val.companion<MixedUser>().implTrait(Named);
