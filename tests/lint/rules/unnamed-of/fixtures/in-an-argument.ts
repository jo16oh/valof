import { Val } from "valof";

type Token = Val<"Token", string>;

const take = (t: Token): string => t;

export const shout = (raw: string): string => take(Val.of(raw)).toUpperCase();
