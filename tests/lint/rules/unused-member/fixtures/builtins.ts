// Rejected by `.impl` at the type level. Plain JS can still write them, and none is a finding.
const User = Val.companion().impl({
  equals: (a, b) => a.id === b.id,
  patch: (v, p) => ({ ...v, ...p }),
  update: (v, fn) => fn(v),
  seal: (v) => v,
  create: (id) => ({ id }),
});
