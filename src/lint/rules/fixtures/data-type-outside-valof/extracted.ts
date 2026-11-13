export const label = (n: number): string => String(n);
export type Labeler = typeof label;
export type Wrapped = { r: ReturnType<typeof label> };

export const Kind = class {};
