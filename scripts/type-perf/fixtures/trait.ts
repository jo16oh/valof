// What `Trait` adds on top of `core.ts`: the same shapes, plus the brand check on `Val`, the
// `Self` substitution in `implTrait`, a `Dyn` box, and an `implAssoc` member over boxes.
import { Trait, Val, type Dyn, type Final, type Self } from "valof";

type Named = Trait<
  "Named",
  { name: string },
  {
    label: (self: Self, sep: string) => string;
    greet: (self: Self) => string;
    shout: Final<(self: Self) => string>;
  }
>;
const Named = Trait.companion<Named>()
  .impl(() => ({
    greet: (n) => `Hi, ${n.name}`,
    shout: (n) => n.name.toUpperCase(),
  }))
  .implAssoc(() => ({
    labelled: (sep: string, boxes: readonly Dyn<Named>[]) => boxes.map((b) => b.label(sep)),
  }))
  .build();

type Sized = Trait<
  "Sized",
  { size: { w: number; h: number } },
  { scaled: (self: Self, by: number) => number; area: (self: Self) => number }
>;
const Sized = Trait.companion<Sized>()
  .impl(() => ({ area: (s) => s.size.w * s.size.h }))
  .build();

type Room = Val<
  "Room",
  { id: string; name: string; size: { w: number; h: number } },
  Named & Sized
>;
// Without `implCreate`, what `implTrait` passes is too small for the budget to catch inference
// walking it.
const Room = Val.companion<Room>()
  .implCreate((name: string) => ({ id: name, name, size: { w: 1, h: 1 } }))
  .implTrait(Named, ({ patch }) => ({
    label: (r, sep) => `${r.id}${sep}${patch(r, { name: r.name.trim() }).name}`,
  }))
  .implTrait(Sized, () => ({ scaled: (r, by) => r.size.w * by }))
  .impl(() => ({
    describe(r): string {
      return `${r.name} ${Room.area(r)}`;
    },
  }))
  .build();

type Tag = Val<"Tag", { name: string; kind: string }, Named>;
const Tag = Val.companion<Tag>()
  .implTrait(Named, () => ({
    label: (t, sep) => `${t.kind}${sep}${t.name}`,
  }))
  .build();

type Point = Val<"Point", { name: string; size: { w: number; h: number } }, Named & Sized>;
const Point = Val.companion<Point>()
  .implTrait(Named, () => ({ label: (p, sep) => `${p.name}${sep}` }))
  .implTrait(Sized, () => ({ scaled: (p, by) => p.size.w * by }))
  .build();

// A Val carrying a trait, nested in one that carries another: the payload check has to stop at
// the brand rather than walk the trait's own shape.
type Floor = Val<
  "Floor",
  { name: string; size: { w: number; h: number }; main: Room },
  Named & Sized
>;
const Floor = Val.companion<Floor>()
  .implTrait(Named, () => ({ label: (f, sep) => `${f.name}${sep}${f.main.id}` }))
  .implTrait(Sized, () => ({ scaled: (f, by) => f.size.h * by }))
  .build();

declare const floor: Floor;
declare const room: Room;
declare const tag: Tag;

export const boxed: Dyn<Named>[] = [Named.dyn(Room, room), Named.dyn(Tag, tag)];
export const labels = boxed.map((b) => `${b.label(":")} ${b.greet()} ${Named.shout(b)}`);
export const labelled = [Named.labelled(":", boxed), Named.labelled(boxed)(":")];
// A final reaches every path a member does, and the trait namespace besides.
export const shouted = [Room.shout(room), Named.shout(tag), Named.dyn(Tag, tag).shout()];
export const point = Point.seal({ name: "o", size: { w: 1, h: 2 } });
export const nested = [
  Floor.label(floor, "/"),
  Floor.scaled(floor, 2),
  Room.describe(floor.main),
  Floor.patch(floor, { main: floor.main }),
  Named.dyn(Floor, floor).greet(),
];
export const direct = [
  Room.label(room, "/"),
  Room.scaled(room, 2),
  Tag.label(tag, "/"),
  Room.describe(room),
];
