import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({ greet: (u) => u.id })).build();

type User = Val<"orders/User", string>;
