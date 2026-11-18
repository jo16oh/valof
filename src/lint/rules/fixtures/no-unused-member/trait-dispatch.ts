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

type User = Val<"User", Record<never, never>, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, () => ({ greet: (u) => u.name })).build();

User.dyn<Greetable>(user).greet;
const boxed = User.dyn<Greetable>(user);
boxed.wave;
const { nod } = User.dyn<Greetable>(user);

declare const user: User;
