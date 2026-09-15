type Greetable = Trait<"Greetable", { name: string }>;

export const Friendly = Trait.companion<Greetable>();
