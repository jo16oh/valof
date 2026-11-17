import { resolve } from "node:path";

import { Val } from "../../lib/index.ts";
import { KindSet, type Kind } from "../rules/rule.ts";

/** What `data-type-outside-valof` reports beyond what it always reports. */
export type DataTypeSettings = Val<
  "DataTypeSettings",
  {
    /** Report a class, declared or as an expression. */
    classes: boolean;
    /** Report a data shape in a type parameter's constraint: `<T extends { id: string }>`. */
    constraints: boolean;
    /** Report a type taken out of a value: `typeof`, `ReturnType`, `Awaited` and the like. */
    extraction: boolean;
  }
>;
export const DataTypeSettings = Val.companion<DataTypeSettings>()
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

/** The rules that are off unless named here, with their settings. */
export type Enabled = Val<"Enabled", { "data-type-outside-valof": DataTypeSettings | undefined }>;
export const Enabled = Val.companion<Enabled>()
  .implCreate(
    ({
      "data-type-outside-valof": model,
    }: { "data-type-outside-valof"?: Parameters<typeof DataTypeSettings.create>[0] } = {}) => ({
      "data-type-outside-valof": model && DataTypeSettings.create(model),
    }),
  )
  .build();

/** The resolved paths a run reports on. */
export type Targets = Val.Record<"Targets", string, true>;
export const Targets = Val.Record.companion<Targets>().build();

/** Source to read in place of the file on disk, keyed by resolved path. */
export type Overlay = Val.Record<"Overlay", string, string>;
export const Overlay = Val.Record.companion<Overlay>().build();

/** How a run reads and reports. Paths are resolved, so any spelling of a file finds it. */
export type Options = Val<
  "Options",
  {
    enable: Enabled;
    /** Kinds to leave out of the run. A skipped rule does no work, not merely no reporting. */
    skip: KindSet;
    /**
     * The files to report on, or `null` for every file scanned. Everything else in `files` is still
     * scanned. A duplicate brand needs the other alias, a second name needs the Val alias, and a
     * member's read may be in any file. Narrowing the run instead would silence them and make a working
     * directive look unused.
     */
    targets: Targets | null;
    /**
     * Source to read instead of the file on disk, keyed by path, for an editor's unsaved buffer. A path
     * here that is not in `files` is scanned all the same, and need not exist.
     */
    overlay: Overlay;
  }
>;
export const Options = Val.companion<Options>()
  .implCreate(
    ({
      enable = {},
      skip = [],
      targets,
      overlay = [],
    }: {
      enable?: Parameters<typeof Enabled.create>[0];
      skip?: Iterable<Kind>;
      targets?: Iterable<string>;
      overlay?: Iterable<readonly [string, string]>;
    } = {}) => ({
      enable: Enabled.create(enable),
      skip: KindSet.create(skip),
      targets: targets
        ? Targets.seal([...targets].map((file) => [resolve(file), true] as const))
        : null,
      overlay: Overlay.seal([...overlay].map(([file, text]) => [resolve(file), text] as const)),
    }),
  )
  .build();
