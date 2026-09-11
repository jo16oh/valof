type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;
type Behaviours = Greetable & Named;

const Greetable = Trait.companion<Greetable>();

export type User = Val<"User", { name: string }, Behaviours>;
export const User = Val.companion<User>().implTrait(Greetable).implTrait<Named>({});
