import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({})).build();

type User = Val<"User", string>;
