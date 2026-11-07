import { resolve } from "node:path";

import { Val } from "../index.ts";
import { KindSet } from "./rules/rule.ts";

/** What `model-only-in-valof` reports beyond what it always reports. */
export type ModelSettings = Val<
  "ModelSettings",
  {
    /** Report a class, declared or as an expression. */
    classes: boolean;
    /** Report a data shape in a type parameter's constraint: `<T extends { id: string }>`. */
    constraints: boolean;
    /** Report a type taken out of a value: `typeof`, `ReturnType`, `Awaited` and the like. */
    extraction: boolean;
  }
>;
export const ModelSettings = Val.companion<ModelSettings>()
  .implCreate(
    ({
      classes = false,
      constraints = false,
      extraction = false,
    }: { classes?: boolean; constraints?: boolean; extraction?: boolean } = {}) => ({
      classes,
      constraints,
      extraction,
    }),
  )
  .build();

/** How a run reads and reports. Paths are resolved, so any spelling of a file finds it. */
export type Options = Val<
  "Options",
  {
    /** The rules that are off unless named here, with their settings. */
    enable: { "model-only-in-valof"?: ModelSettings };
    /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
    skip: KindSet;
    /**
     * Files to report on, or `null` for every file scanned. Everything else in `files` is still
     * scanned.
     *
     * Three rules need a second file to say anything: a duplicate brand needs the other alias, a
     * second name needs the Val alias, and a member is read from wherever it is read. Narrowing the
     * run instead of the report turns those into silence, and turns a directive that is doing its
     * job into an `unused-disable`.
     */
    report: Record<string, true> | null;
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
      enable = {},
      skip = [],
      report,
      overlay = [],
    }: {
      enable?: { "model-only-in-valof"?: Parameters<typeof ModelSettings.create>[0] };
      skip?: Iterable<string>;
      report?: Iterable<string>;
      overlay?: Iterable<readonly [string, string]>;
    } = {}) => ({
      enable: enable["model-only-in-valof"]
        ? { "model-only-in-valof": ModelSettings.create(enable["model-only-in-valof"]) }
        : {},
      skip: KindSet.create(skip),
      report: report
        ? Object.fromEntries([...report].map((file) => [resolve(file), true as const]))
        : null,
      overlay: Object.fromEntries([...overlay].map(([file, text]) => [resolve(file), text])),
    }),
  )
  .impl(() => ({
    reports: (options, file: string) =>
      options.report === null || Object.hasOwn(options.report, resolve(file)),
    /** The source given for the file, or `undefined` to read it from disk. */
    sourceOf: (options, file: string) => {
      const key = resolve(file);
      return Object.hasOwn(options.overlay, key) ? options.overlay[key] : undefined;
    },
  }))
  .build();
