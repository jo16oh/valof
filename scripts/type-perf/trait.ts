// What `Trait` adds on top of `core.ts`: the same shapes, plus the brand check on `Val`, the
// `Self` substitution in `implTrait`, and a `Dyn` box.
import { Val, Trait, type Dyn, type Self } from "valof";

type Named = Trait<"Named", { name: string }, { label: (self: Self, sep: string) => string }>;
const Named = Trait.companion<Named>().impl({
  greet: (n) => `Hi, ${n.name}`,
  initial: (n) => n.name.slice(0, 1),
});

type Sized = Trait<
  "Sized",
  { size: { w: number; h: number } },
  { scaled: (self: Self, by: number) => number }
>;
const Sized = Trait.companion<Sized>().impl({
  area: (s) => s.size.w * s.size.h,
});

type Room = Val<
  "Room",
  { id: string; name: string; size: { w: number; h: number } },
  Named & Sized
>;
const Room = Val.companion<Room>()
  .implTrait(Named, { label: (r, sep) => `${r.id}${sep}${r.name}` })
  .implTrait(Sized, { scaled: (r, by) => r.size.w * by })
  .impl({
    describe(r) {
      return `${r.name} ${Sized.area(r)}`;
    },
  });

type Tag = Val<"Tag", { name: string; kind: string }, Named>;
const Tag = Val.companion<Tag>().implTrait(Named, {
  label: (t, sep) => `${t.kind}${sep}${t.name}`,
});

// A sealer takes traits too, and stays callable.
type Point = Val<"Point", { name: string; size: { w: number; h: number } }, Named & Sized>;
const Point = Val.sealer<Point>()
  .implTrait(Named, { label: (p, sep) => `${p.name}${sep}` })
  .implTrait(Sized, { scaled: (p, by) => p.size.w * by });

declare const room: Room;
declare const tag: Tag;

export const boxed: Dyn<Named>[] = [Named.dyn(Room, room), Named.dyn(Tag, tag)];
export const labels = boxed.map((b) => `${b.label(":")} ${Named.greet(b)}`);
export const point = Point({ name: "o", size: { w: 1, h: 2 } });
export const direct = [
  Room.label(room, "/"),
  Room.scaled(room, 2),
  Tag.label(tag, "/"),
  Room.describe(room),
];
