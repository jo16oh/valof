// Exports the book does not show. Each inferred type references a type no entry exports, so its
// `.d.ts` emits only when the package exposes that type by a path a consumer can import.
import { Val, type PrivateCreate, type PrivateSeal } from "valof";
import { Trait, type Self } from "valof/experimental";

export type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
export const greetableBuilder = Trait.companion<Greetable>().impl({ greet: (g) => g.name });

export type Session = Val<"Session", { id: string }>;
export const Session = Val.companion<Session, [PrivateSeal]>()
  .implCreate(() => ({ id: crypto.randomUUID() }))
  .build();

export type Token = Val<"Token", { value: string }>;
export const Token = Val.companion<Token, [PrivateCreate]>().build();
