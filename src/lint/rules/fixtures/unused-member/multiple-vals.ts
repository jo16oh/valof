import { Trait, Val, type Self } from "valof";
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
const Greetable = Trait.companion<Greetable>().impl(() => ({ greet: (g) => g.name })).build();

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, () => ({ greet: (u) => u.name })).build();

type Admin = Val<"Admin", { name: string }, Greetable>;
const Admin = Val.companion<Admin>().implTrait(Greetable, () => ({ greet: (a) => a.name })).build();

User.dyn<Greetable>(user).greet;

declare const user: User;
