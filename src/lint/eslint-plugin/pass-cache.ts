import type { Finding } from "../rules/index.ts";

/**
 * The findings of the file the host is linting, shared by its rules until the call stack empties.
 * Asking once per rule would stat the project once per rule. The host runs a file's `Program`
 * handlers back to back, and asking the worker blocks the thread, so nothing runs between them.
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
