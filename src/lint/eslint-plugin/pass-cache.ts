import type { Finding } from "../index.ts";

/**
 * The findings of the file the host is linting, shared by its rules until the call stack empties.
 *
 * The host creates every rule for a file before it walks the file, so their `Program` handlers run
 * back to back. Asking the worker blocks the thread, so no other code runs between them. Asking
 * once per rule would stat the project once per rule.
 */
export class PassCache {
  #key: string | undefined;
  #findings: readonly Finding[] = [];

  /** The findings `ask` returns for `key`, asked once per key until the call stack empties. */
  findings(key: string, ask: () => readonly Finding[]): readonly Finding[] {
    if (this.#key === key) return this.#findings;

    const findings = ask();
    this.#key = key;
    this.#findings = findings;
    queueMicrotask(() => (this.#key = undefined));

    return findings;
  }
}
