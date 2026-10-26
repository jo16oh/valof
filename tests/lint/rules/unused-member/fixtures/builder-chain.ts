const Doc = Val.companion<Doc, [Unpatchable<"id">]>()
  .implSeal((d, seal) => seal(d))
  .impl(() => ({
    title: (d) => d.title,
    subtitle: (d) => d.title,
  })).build();

Doc.title(doc);
