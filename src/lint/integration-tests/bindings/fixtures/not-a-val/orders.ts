export type B = Branded<"Id", string>;

type Branded<K extends string, T> = T & { readonly brand: K };
