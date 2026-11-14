import { Val } from "valof";
const members = () => ({ quiet: (b: B) => b.length });
const B = Val.companion<B>().impl(members).build();

const C = Val.companion<C>()
  .impl(() => {
    return { hidden: (c) => c.name };
  })
  .build();

type B = Val<"B", string>;
type C = Val<"C", { id: string; name: string; title: string }>;
