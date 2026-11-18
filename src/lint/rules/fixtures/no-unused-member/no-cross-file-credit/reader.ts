// @ts-expect-error -- the module is absent on purpose
import { Other as User } from "./elsewhere.ts";

User.greet(other);

declare const other: User;
