import { Enum, Val, type Payload } from "valof";

export type Name = Payload<string>;
export type Level = Payload<number>;
export type Mode = Enum<"Mode", { On: { level: number }; Off: { note: string } }>;
export const Mode = Enum.companion<Mode>()
  .Off.impl(() => ({ named: (off, name: Name) => off.note + name }))
  .On.implCreate((level: Level) => ({ level }))
  .build();
export const read = [Mode.Off.named, Mode.On.create(1)];

export type Tag = Val<"Tag", { name: Name }>;
export const Tag = Val.companion<Tag>()
  .implSeal((tag: { name: Name }, seal) => seal(tag))
  .build();
