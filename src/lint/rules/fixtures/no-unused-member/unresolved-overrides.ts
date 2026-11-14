import { Trait, Val, type Self } from "valof";
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
const Greetable = Trait.companion<Greetable>().impl(() => ({ greet: (g) => g.name })).build();

declare const condition: boolean;
const selected = condition ? { greet: (u: User) => u.name } : {};

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, () => selected).build();
User.greet;
