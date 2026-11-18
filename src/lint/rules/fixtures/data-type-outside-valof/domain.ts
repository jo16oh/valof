import { Enum, Trait, Val, type Payload, type PayloadOf } from "valof";

export type User = Val<"User", { id: string; name: string }>;
export type Shape = Enum<"Shape", { Circle: { r: number }; Square: { side: number } }>;
export type Named = Trait<"Named", { name: string }>;
export type Person = User | Shape;
export type Handler = (user: User) => void;

export type Row = { id: string };
export interface Props {
  user: User;
}
export type UserId = string;
export type Status = "draft" | "published";
export type Ids = readonly string[];
export type Partialed = Partial<User>;
export type OnRow = (row: { id: string }) => void;

export type Fields = Payload<Omit<PayloadOf<User>, "id">>;
export type Name = Payload<string>;
export type Order = Val<"Order", { total: { amount: number }; name: Name }>;

export const label = (name: Name): string => name;
export const User = Val.companion<User>()
  .implCreate((fields: Fields) => ({ id: "x", ...fields }))
  .build();

export class Thing {}
export const pick = <T extends { id: string }>(value: T): T => value;
export type Made = ReturnType<typeof label>;

declare global {
  interface Window {
    app: string;
  }
}

export type Flag = boolean;
export type Code = `id-${string}`;
