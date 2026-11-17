// The namespace `Val` exports, so a bundler drops the members a caller never reads.
import type { OneLiteral, RecordValue, ValRecord } from "../val.ts";

export { companion, of, unwrap } from "../val.ts";
export * as Record from "./record.ts";

/** {@link ValRecord} */
export type Record<
  B extends OneLiteral<B, "a Val's brand must be one string literal">,
  K extends string,
  V extends RecordValue<V>,
> = ValRecord<B, K, V>;
