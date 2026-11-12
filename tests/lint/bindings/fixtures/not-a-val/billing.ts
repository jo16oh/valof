export type A = Branded<"Id", string>;

type Branded<K extends string, T> = T & { readonly brand: K };
