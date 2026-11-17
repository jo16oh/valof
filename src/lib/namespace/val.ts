// The namespace `Val` exports, so a bundler drops the members a caller never reads.
import type { ValRecord } from "../val.ts";

export { companion, of, unwrap } from "../val.ts";
export * as Record from "./record.ts";

/** {@link ValRecord} */
export type Record<B extends string, K extends string, V> = ValRecord<B, K, V>;
