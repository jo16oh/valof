import { Shared as A } from "./barrel-a";
import { Shared as B } from "./barrel-b";

type BarrelUser = Val<"BarrelUser", {}, A & B>;
const BarrelUser = Val.companion<BarrelUser>().implTrait(A);
