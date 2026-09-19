const store = { impl: (value: number) => value, fixed: () => 0 };

export const out = [store.impl(1), store.fixed()];
