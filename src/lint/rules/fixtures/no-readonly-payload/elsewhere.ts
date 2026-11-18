import { Val } from "valof";

type Tags = readonly string[];
export type Post = Val<"Post", { tags: Tags; theme: keyof Settings }>;

export type Settings = { readonly theme: string; fonts: ReadonlyArray<string> };

export function first(tags: readonly string[]): string | undefined {
  return tags[0];
}

export class Cache {
  readonly entries: Readonly<Record<string, string>> = {};
}
