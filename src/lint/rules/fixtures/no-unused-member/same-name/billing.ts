import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({ greet: (u) => u.name })).build();

type User = Val<"billing/User", { id: string; name: string; title: string }>;
