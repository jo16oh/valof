type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;

export type User = Val<"User", { name: string }, Greetable & (Named)>;
export const User = Val.companion<User>().implTrait(Greetable);

type Behaviours = (Greetable & Named);
export type Admin = Val<"Admin", { name: string }, Behaviours>;
export const Admin = Val.companion<Admin>().implTrait(Greetable);
