const Id = Val.sealer().impl({
  short: (i) => i.slice(0, 4),
  shout: (i) => i.toUpperCase(),
});

Id.short(id);
