import { Val } from "valof";
const Id = Val.companion<Id>().impl(() => ({
  shout: (i) => i.toUpperCase(),
})).build();

type Id = Val<"Id", string>;
