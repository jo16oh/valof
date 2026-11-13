import { Val } from "valof";
const Id = Val.companion<Id>().impl(() => ({
  short: (i) => i.slice(0, 4),
})).build();

Id.short(id);

type Id = Val<"clean/Id", string>;
declare const id: Id;
