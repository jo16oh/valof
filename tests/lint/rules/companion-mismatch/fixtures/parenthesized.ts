type User = Val<"User", { id: string }>;
type Greetable = Trait<"Greetable", { name: string }>;

export const Account = Val.companion<((User))>();
export const Friendly = Trait.companion<(Greetable)>();
