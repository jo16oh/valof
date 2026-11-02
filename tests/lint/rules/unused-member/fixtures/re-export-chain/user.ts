import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  greet: (u) => u.name,
  shout: (u) => u.id,
})).build();

export { User as Public };

type User = Val<"User", { id: string; name: string; title: string }>;
