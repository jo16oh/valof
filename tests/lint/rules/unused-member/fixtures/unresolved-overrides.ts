type Greetable = Trait<"Greetable", { name: string }, { greet: () => string }>;
const Greetable = Trait.companion<Greetable>().impl({ greet: () => "default" });

declare const condition: boolean;
const selected = condition ? { greet: () => "selected" } : {};

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, selected);
User.greet;

const first = { ...second };
const second = { ...first };
type Admin = Val<"Admin", { name: string }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, first);
Admin.greet;
