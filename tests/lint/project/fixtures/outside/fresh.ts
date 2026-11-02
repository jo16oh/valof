import { Val } from "valof";
const User = Val.companion<User>().impl(() => ({
  shout: (u) => u.toUpperCase(),
})).build();
