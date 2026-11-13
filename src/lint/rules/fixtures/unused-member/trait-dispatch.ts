import { Trait, Val, type Self } from "valof";
type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: Self) => string;
    wave: (self: Self) => string;
    nod: (self: Self) => string;
  }
>;

const Greetable = Trait.companion<Greetable>().impl(() => ({
  greet: (g) => g.name,
  wave: (g) => g.name,
  nod: (g) => g.name,
})).build();

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, () => ({ greet: (u) => u.name })).build();

Greetable.dyn(User, user).greet;
const boxed = Greetable.dyn(User, user);
boxed.wave;
const { nod } = Greetable.dyn(User, user);

declare const user: User;
