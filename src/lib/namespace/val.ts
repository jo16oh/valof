// The namespace `Val` exports, so a bundler drops the members a caller never reads.
import type { ValMap, ValSet } from "../val.ts";

export { companion, of, unwrap } from "../val.ts";
export * as Map from "./map.ts";
export * as Set from "./set.ts";

/** {@link ValMap} */
export type Map<B extends string, K extends string, V> = ValMap<B, K, V>;
/** {@link ValSet} */
export type Set<B extends string, K extends string> = ValSet<B, K>;
