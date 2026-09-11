export type Greetable = Trait<"Greetable", { name: string }>;
export const Greetable = Trait.companion<Greetable>();

export type Named = Trait<"Named", { name: string }>;
export const Named = Trait.companion<Named>();
