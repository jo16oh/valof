import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  slug(u) {
    return u.name.toLowerCase();
  },
  MAX: 10,
})).build();

type User = Val<"User", { id: string; name: string; title: string }>;
