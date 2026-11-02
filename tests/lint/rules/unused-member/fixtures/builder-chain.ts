import { Unpatchable, Val } from "valof";
const Doc = Val.companion<Doc, [Unpatchable<"id">]>()
  .implSeal((d, seal) => seal(d))
  .impl(() => ({
    title: (d) => d.title,
    subtitle: (d) => d.title,
  })).build();

Doc.title(doc);

type Doc = Val<"Doc", string>;
declare const doc: Doc;
