import { Trait, Val } from "valof";
type Greetable = Trait<"Greetable", { name: string }>;
const Greetable = Trait.companion<Greetable>().build();
type User = Val<"User", Record<never, never>, Greetable>;

const builder = Val.companion<User>();
export const User = builder.implTrait(Greetable).build();
