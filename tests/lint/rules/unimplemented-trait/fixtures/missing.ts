type Greetable = Trait<"Greetable", { name: string }>;
type Named = Trait<"Named", { name: string }>;

export type User = Val<"User", { name: string }, Greetable>;
export const User = Val.companion<User>();

export type Admin = Val<"Admin", { name: string }, Greetable & Named>;
export const Admin = Val.companion<Admin>().implTrait(Greetable);

export type Guest = Val<"Guest", { name: string }, Named>;
