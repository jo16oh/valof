import { Val } from "valof";

type Tags = readonly string[];
export type Post = Val<"Post", { tags: Tags; theme: keyof Settings }>;

export type Settings = { readonly theme: string; fonts: ReadonlyArray<string> };
