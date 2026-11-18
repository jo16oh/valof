import { Val } from "valof";
import { Shared as Named } from "./traits/index.js";
// @ts-expect-error -- a directory import, which TypeScript's node16 resolution rejects
import * as traits from "./traits";

type User = Val<"User", {}, Named & traits.Shared>;
const User = Val.companion<User>().implTrait(Named).build();
