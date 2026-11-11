import { Val } from "valof";

import { shout } from "./helpers.ts";

export type User = Val<"User", { name: string }>;

type ToWire = (u: User, sep: string) => string;
const toWire: ToWire = (u, sep = ",") => u.name + sep;
const tags: (u: User, tag: string) => string = (u, ...more) => [u.name, ...more].join();
const short: (u: User) => string = (u, cut = 4) => u.name.slice(0, cut);

export const User = Val.companion<User>()
  .impl(() => ({ toWire, tags, short, yell: shout }))
  .build();

export type Tag = Val<"Tag", { name: string }>;
type Labels = { label: (t: Tag, prefix: string) => string; plain: (t: Tag) => string };
const labels: Labels = { label: (t, prefix = "#") => prefix + t.name, plain: (t) => t.name };

export const Tag = Val.companion<Tag>()
  .impl(() => labels)
  .build();

export const read = [User.toWire, User.tags, User.short, User.yell, Tag.label, Tag.plain];

export type Item = Val<"Item", { name: string }>;
// No annotation, so nothing hides the default.
const plain = (i: Item, sep = ",") => i.name + sep;
type Glue = (i: Item, sep: string) => string;
const glue: Glue = function (i, sep = ",") {
  return i.name + sep;
};

export const Item = Val.companion<Item>()
  // @ts-expect-error -- the type rejects plain's default, which leaves the linter nothing to add
  .impl(() => ({ plain, glue }))
  .build();

export const readItem = [Item.plain, Item.glue];
