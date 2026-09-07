const Doc = Val.companion<Doc>()
  .implSeal((d, seal) => seal(d))
  .implEquals({ title: (a, b) => a === b })
  .fixed<"id">()
  .impl({
    title: (d) => d.title,
    subtitle: (d) => d.title,
  });

Doc.title(doc);
