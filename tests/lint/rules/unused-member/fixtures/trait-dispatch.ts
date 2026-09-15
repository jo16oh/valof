type Greetable = Trait<
  "Greetable",
  { name: string },
  {
    greet: (self: unknown) => string;
    wave: (self: unknown) => string;
    nod: (self: unknown) => string;
  }
>;

const Greetable = Trait.companion<Greetable>()
  .impl({ greet: () => "hello" })
  .impl({ wave: () => "wave", nod: () => "nod" });

type User = Val<"User", { name: string }, Greetable>;
const User = Val.companion<User>().implTrait(Greetable, { greet: () => "hi" });

Greetable.dyn(User, {}).greet;
const boxed = Greetable.dyn(User, {});
boxed.wave;
const { nod } = Greetable.dyn(User, {});
