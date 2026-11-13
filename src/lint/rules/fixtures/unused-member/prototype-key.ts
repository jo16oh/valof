import { Val } from "valof";
const constructor = Val.companion<constructor>().impl(() => ({
  short: (id) => id,
})).build();

constructor.short(id);

type constructor = Val<"constructor", string>;
declare const id: constructor;
