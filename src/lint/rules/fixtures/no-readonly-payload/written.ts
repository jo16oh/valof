import { Enum, Tag, Val } from "valof";

export type Post = Val<"Post", { tags: readonly string[]; readonly title: string }>;
export type Index = Val.Record<"Index", string, ReadonlyArray<readonly number[]>>;
export type Media = Enum<
  "Media",
  { Book: { pages: Readonly<{ count: number }> }; Film: { minutes: number } },
  Tag<"kind"> & { readonly id: string }
>;
export type Page = Val<"Page", { meta: { authors: { names: readonly string[] | null }[] } }>;
export type Span = Val<"Span", readonly [number, readonly number[]]>;
export type Shelf = Val<"Shelf", { rows: (readonly string[])[]; pair: [x: readonly string[]] }>;
export type Rest = Val<"Rest", [number, ...(readonly string[])[]]>;
export type Gap = Val<"Gap", [(readonly number[])?]>;
