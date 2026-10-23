type Greetable = Trait<"Greetable", { name: string }>;
const Greetable = Trait.companion<Greetable>().build();

export type User = Val<"User", { name: string }, Greetable>;
export const User = Val.companion<((User))>().implTrait(Greetable).build();
