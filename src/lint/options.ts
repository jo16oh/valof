import { resolve } from "node:path";

import { Val } from "../index.ts";
import { KindSet, type Kind } from "./rules/index.ts";

/** How a run reads and reports. Paths are resolved, so any spelling of a file finds it. */
export type Options = Val<
  "Options",
  {
    /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
    skip: KindSet;
    /**
     * The files to report on, or `null` for every file scanned. Everything else in `files` is still
     * scanned.
     *
     * Three rules need a second file to say anything: a duplicate brand needs the other alias, a
     * second name needs the Val alias, and a member is read from wherever it is read. Narrowing the
     * run instead of the report turns those into silence, and turns a directive that is doing its
     * job into an `unused-disable`.
     */
    targets: Record<string, true> | null;
    /**
     * Source to read instead of the file on disk, keyed by path.
     *
     * For an editor: the buffer the user is typing in has not been saved, and a run over what disk
     * holds reports on the file as it was. A path here that is not in `files` is scanned all the
     * same, and the file need not exist.
     */
    overlay: Record<string, string>;
  }
>;
export const Options = Val.companion<Options>()
  .implCreate(
    ({
      skip = [],
      targets,
      overlay = [],
    }: {
      skip?: Iterable<Kind>;
      targets?: Iterable<string>;
      overlay?: Iterable<readonly [string, string]>;
    } = {}) => ({
      skip: KindSet.create(skip),
      targets: targets
        ? Object.fromEntries([...targets].map((file) => [resolve(file), true as const]))
        : null,
      overlay: Object.fromEntries([...overlay].map(([file, text]) => [resolve(file), text])),
    }),
  )
  .impl(() => ({
    /** Whether a finding in the file is reported. */
    isTarget: (options, file: string) =>
      options.targets === null || Object.hasOwn(options.targets, resolve(file)),
    /** The source given for the file, or `undefined` to read it from disk. */
    sourceOf: (options, file: string) => {
      const key = resolve(file);
      return Object.hasOwn(options.overlay, key) ? options.overlay[key] : undefined;
    },
  }))
  .build();
