type Greetable = Trait<"Greetable", { name: string }>;

export type Friendly = Greetable;
export type Both = Greetable & { wave: () => void };
export type Maybe = Greetable | undefined;
export type Wrapped = Readonly<Greetable>;
