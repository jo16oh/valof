type Greetable = Trait<"Greetable", { name: string }, { greet: () => string }>;
const Greetable = Trait.companion<Greetable>().impl({ greet: () => "default" });

const first = { greet: () => "first" };
const second = { ...first };
const overrides = { ...second };

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, overrides);
User.greet;
