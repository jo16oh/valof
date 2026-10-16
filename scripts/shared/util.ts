import { Result as R, type Err } from "better-result";

import type { Sink } from "./pipe/index.ts";

interface GenAwait extends Sink {
  readonly out: this["in"] extends Promise<R<infer A, infer E>>
    ? AsyncGenerator<Err<never, E>, A>
    : never;
}

/**
 * The last step of a `flow` that holds a Result: inside `Result.gen`, `yield*` the call to
 * take the Ok value, or to stop at the Err.
 */
export const GenAwait = { sink: R.await } as unknown as GenAwait;
