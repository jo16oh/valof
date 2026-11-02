import { Val } from "valof";
import { Shared as A } from "./barrel-a.ts";
import { Shared as B } from "./barrel-b.ts";

type BarrelUser = Val<"BarrelUser", {}, A & B>;
const BarrelUser = Val.companion<BarrelUser>().implTrait(A).build();
