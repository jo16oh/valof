import { Val } from "valof";

type User = Val<"User", { id: string; name: string }>;

const Account = Val.sealer<User>().impl({
  greet: (u) => u.name,
});

Account.greet(Account({ id: "a", name: "bob" }));
