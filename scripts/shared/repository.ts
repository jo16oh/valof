// The repository the scripts run in, and the child processes they start there.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** The repository's root, which every path the scripts read is relative to. */
export const repository = new URL("../../", import.meta.url);
export const root = fileURLToPath(repository);

export const run = promisify(execFile);

/** What a failed child process printed, or the error itself where it printed nothing. */
export function output(error: unknown): string {
  const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
  return `${stdout}${stderr}` || String(error);
}

/** Writes `value` as indented JSON, ending in a newline. */
export function writeJson(file: string | URL, value: unknown): Promise<void> {
  return writeFile(file, `${JSON.stringify(value, undefined, 2)}\n`);
}
