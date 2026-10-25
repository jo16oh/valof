import { Enum } from "valof/experimental";

export type Cmd = Enum<"Cmd", { impl: { n: number }; seal: { s: string } }>;
export const Cmd = Enum.companion<Cmd>()
  .impl.impl({ twice: (c) => c.n * 2, unread: (c) => c.n })
  .seal.impl({ size: (c) => c.s.length })
  .impl({ label: (c) => c._tag })
  .build();

export const read = [Cmd.impl.twice, Cmd.seal.size, Cmd.label];
