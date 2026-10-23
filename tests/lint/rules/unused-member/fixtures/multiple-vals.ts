type Greetable = Trait<"Greetable", { name: string }, { greet: () => string }>;
const Greetable = Trait.companion<Greetable>().impl({ greet: () => "default" }).build();

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, { greet: () => "user" }).build();

type Admin = Val<"Admin", { name: string }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, { greet: () => "admin" }).build();

Greetable.dyn(User, {}).greet;
