const Doc = Val.companion<Doc>()
  .implSeal((d, seal) => seal(d))
  .unpatchable<"id">()
  .impl({
    title: (d) => d.title,
    subtitle: (d) => d.title,
  });

Doc.title(doc);
