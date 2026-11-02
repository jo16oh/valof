import { Val } from "valof";

const reserved = (id: string): boolean => id === "admin";

type Id = Val<"Id", string>;
const Id = Val.companion<Id>()
  .implSeal((text, seal): Id | undefined => {
    const id = seal(text);
    return reserved(id) ? undefined : id;
  })
  .implCreate.noseal(() => "x")
  .build();

type Code = Val<"Code", string>;
const Code = Val.companion<Code>()
  .implSeal((text, seal) => (/^[a-z]+$/.test(text) ? seal(text) : undefined))
  .implCreate.noseal(() => "x")
  .build();

type Key = Val<"Key", string>;
const Key = Val.companion<Key>()
  .implSeal(function (text, seal) {
    if (reserved(text)) return undefined;
    return [seal(text)][0];
  })
  .implCreate.noseal(() => "x")
  .build();

type Name = Val<"Name", string>;
const Name = Val.companion<Name>()
  .implSeal((text, seal): Name | undefined => {
    const name = seal(text);
    return reserved(name) ? undefined : name;
  })
  .implCreate(() => "x")
  .build();

export const all = [Id.create(), Code.create(), Key.create(), Name.create()];
