type User = Val<"User", { id: string }>;
type Greetable = Trait<"Greetable", { name: string }>;

export const Account = Val.companion<((User))>().build();
export const Friendly = Trait.companion<(Greetable)>().build();
