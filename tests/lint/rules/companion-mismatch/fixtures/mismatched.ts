import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const Account = Val.companion<User>().impl({
  greet: (u) => u.name,
}).build();

Account.greet(Account.seal({ id: "a", name: "bob" }));
