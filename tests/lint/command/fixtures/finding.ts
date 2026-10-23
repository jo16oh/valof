const Id = Val.companion<Id>().impl({
  short: (i) => i.slice(0, 4),
  shout: (i) => i.toUpperCase(),
}).build();

Id.short(id);
