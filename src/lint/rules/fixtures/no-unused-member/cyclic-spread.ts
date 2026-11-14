import { Val } from "valof";
// @ts-expect-error two objects that spread each other, as code mid-edit can
const a = { ...b, x: (u: User) => u.name };
// @ts-expect-error the other half of the cycle
const b = { ...a };

export const User = Val.companion<User>().impl(() => a).build();

type User = Val<"User", { name: string }>;
