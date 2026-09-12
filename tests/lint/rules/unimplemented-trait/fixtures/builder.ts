type Greetable = Trait<"Greetable", { name: string }>;
type User = Val<"User", { name: string }, Greetable>;

const builder = Val.companion<User>();
export const User = builder.implTrait<Greetable>({});
