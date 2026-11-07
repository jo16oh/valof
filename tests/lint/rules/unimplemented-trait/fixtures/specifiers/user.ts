import { Shared as Named } from "./traits/index.js";
import * as traits from "./traits";

type User = Val<"User", {}, Named & traits.Shared>;
const User = Val.companion<User>().implTrait(Named).build();
