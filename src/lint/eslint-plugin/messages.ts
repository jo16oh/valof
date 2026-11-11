import { resolve } from "node:path";

import type { Result as R } from "@praha/byethrow";

import { Val } from "../../index.ts";
import type { Project } from "../files.ts";
import type { Finding } from "../index.ts";
import { ModelSettings } from "../options.ts";

/** What the plugin asks the worker about one file. */
export type Query = Val<
  "Query",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: Project;
    file: string;
    text: string;
    /**
     * The settings of `model-only-in-valof`. It always runs here, because the host reports it only
     * where the project turned it on.
     */
    model: ModelSettings;
  }
>;
export const Query = Val.companion<Query>()
  .implAssoc(({ seal }) => ({
    /** What to ask about the file the host is linting. */
    fromContext: (
      {
        filename,
        sourceCode: { text },
        settings,
      }: {
        filename: string;
        sourceCode: { text: string };
        // A host may leave the settings out.
        settings:
          | {
              valof?: {
                "model-only-in-valof"?: Parameters<typeof ModelSettings.create>[0];
              };
            }
          | undefined;
      },
      project: Project,
    ): Query =>
      seal({
        project,
        file: resolve(filename),
        text,
        model: ModelSettings.create(settings?.valof?.["model-only-in-valof"]),
      }),
  }))
  .impl(() => ({
    /** The same file, text, project and settings give the same key. */
    key: ({ file, text, project, model }): string =>
      `${file}\n${text}\n${project.join("\n")}\n${JSON.stringify(model)}`,
  }))
  .build();

/**
 * What the worker answers: the findings, or the message to throw. A message rather than the error,
 * since an error's class does not survive the copy between threads.
 */
// valof-lint-disable-next-line model-only-in-valof -- byethrow's Result, which the worker sends as is
export type Reply = R.Result<Finding[], string>;
