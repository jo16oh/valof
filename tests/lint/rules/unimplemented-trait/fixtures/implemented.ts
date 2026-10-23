type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;
type Behaviours = Greetable & Named;

const Greetable = Trait.companion<Greetable>().build();
const Named = Trait.companion<Named>().build();

export type User = Val<"User", { name: string }, Behaviours>;
export const User = Val.companion<User>().implTrait(Greetable).implTrait(Named).build();

export type Guest = Val<"Guest", { name: string }, Named>;
export const Guest = Val.companion<Guest>()
  .implCreate.noseal(() => ({ name: "guest" }))
  .implTrait(Named).build();
