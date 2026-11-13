import { Val } from "valof";
type User = Val<"User", string>;
const User = Val.companion<User>().impl(() => ({ name: (u) => u })).build(); Val.of<User>("a");
