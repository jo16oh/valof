const User = Val.sealer<User>().impl({
  bracket: (u) => u.name,
  destructured: (u) => u.name,
  renamed: (u) => u.name,
});

User["bracket"](user);
const { destructured } = User;
const { renamed: aliased } = User;
