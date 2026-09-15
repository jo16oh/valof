// `equals` is ordinary. The rest are rejected by `.impl` and wired by the library.
const User = Val.companion().impl({
  equals: (a, b) => a.id === b.id,
  patch: (v, p) => ({ ...v, ...p }),
  seal: (v) => v,
  create: (id) => ({ id }),
});
