const User = Val.companion<User>().impl({
  bracket: (u) => u.name,
  destructured: (u) => u.name,
  renamed: (u) => u.name,
}).build();

User["bracket"](user);
const { destructured } = User;
const { renamed: aliased } = User;
