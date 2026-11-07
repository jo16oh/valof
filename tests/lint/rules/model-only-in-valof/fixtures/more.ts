import { Enum, Val, type Payload } from "valof";

export type Base = Payload<{ id: string }>;
export type Choice = Enum<"Choice", { A: { box: { n: number } }; B: { m: number } }>;
export type Joined = Val<"Joined", Base & { total: { amount: number } }>;
export type Listed = Val<"Listed", { items: { n: number }[] }>;
export type Mapped = Val<"Mapped", { m: { [K in "a"]: number } }>;

export const label = (n: number): string => String(n);
export type Labeler = typeof label;
export type Wrapped = { r: ReturnType<typeof label> };

export type Name = Payload<string>;
export type Level = Payload<number>;
export type Mode = Enum<"Mode", { On: { level: number }; Off: { note: string } }>;
export const Mode = Enum.companion<Mode>()
  .Off.impl(() => ({ named: (off, name: Name) => off.note + name }))
  .On.implCreate((level: Level) => ({ level }))
  .build();
export const read = [Mode.Off.named, Mode.On.create(1)];

export const Kind = class {};
export type Flag = boolean;
export type Code = `id-${string}`;
