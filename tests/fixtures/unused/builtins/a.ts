const User = Val.companion<User>().impl({
  equals: (a, b) => a.id === b.id,
  with: (v, patch, seal) => seal({ ...v, ...patch }),
  update: (v, fn, seal) => seal(fn(v)),
});
