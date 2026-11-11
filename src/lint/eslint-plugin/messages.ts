import { resolve } from "node:path";

import type { Result as R } from "@praha/byethrow";

import { Val } from "../../index.ts";
import type { Project } from "../files.ts";
import type { Finding } from "../index.ts";

/** What the plugin asks the worker about one file. */
export type Query = Val<
  "Query",
  {
    /** The project files scanned together, absolute. The file being linted joins them, as `text`. */
    project: Project;
    file: string;
    text: string;
  }
>;
export const Query = Val.companion<Query>()
  .implAssoc(({ seal }) => ({
    /** What to ask about the file the host is linting. */
    fromContext: (
      { filename, sourceCode: { text } }: { filename: string; sourceCode: { text: string } },
      project: Project,
    ): Query => seal({ project, file: resolve(filename), text }),
  }))
  .build();

/**
 * What the worker answers: the findings, or the message to throw. A message rather than the error,
 * since an error's class does not survive the copy between threads.
 */
export type Reply = R.Result<Finding[], string>;

/** The findings for one query, under the key the next query is compared by. */
export type Answer = Val<"Answer", { key: string; findings: Finding[] }>;
export const Answer = Val.companion<Answer>().build();
