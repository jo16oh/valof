type Greetable = Trait<"Greetable", { name: string }, { greet: () => string }>;
const Greetable = Trait.companion<Greetable>().impl({ greet: () => "default" });

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<((User))>().implTrait<((Greetable))>({ greet: () => "user" });
User.greet;
