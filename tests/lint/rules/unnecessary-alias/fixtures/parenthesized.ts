type User = Val<"User", { id: string }>;
type Greetable = Trait<"Greetable", { name: string }>;

export type Account = ((User));
export type Friendly = (Greetable);
