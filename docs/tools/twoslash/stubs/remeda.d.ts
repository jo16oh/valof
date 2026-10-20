// The `pipe` README.md imports. A stub, because README.md shows everything above a cut, so the
// block cannot declare it. The arities stop at three steps, the most an example passes.
export declare function pipe<A, B>(data: A, ab: (a: A) => B): B;
export declare function pipe<A, B, C>(data: A, ab: (a: A) => B, bc: (b: B) => C): C;
export declare function pipe<A, B, C, D>(
  data: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
