import { Trait, Val, type Self } from "valof";
type Greetable = Trait<"Greetable", { name: string }, { greet: (self: Self) => string }>;
const Greetable = Trait.companion<Greetable>().impl(() => ({ greet: (g) => g.name })).build();

const first = { greet: (u: User) => u.name };
const second = { ...first };
const overrides = { ...second };

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, () => overrides).build();
User.greet;
