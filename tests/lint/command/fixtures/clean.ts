const Id = Val.companion<Id>().impl({
  short: (i) => i.slice(0, 4),
});

Id.short(id);
