// valof-lint-disable-whole-file unused-member

export type OrderId = Val<"Id", string>;

const User = Val.companion<User>().impl({
  shout: (u) => u.toUpperCase(),
});
