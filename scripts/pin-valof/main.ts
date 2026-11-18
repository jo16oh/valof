//   vp run pin-valof          builds the pinned commit; `prepare` runs this after `vp install`
//   vp run pin-valof <rev>    pins <rev>, and builds it
import { Result as R } from "@praha/byethrow";

import { ROOT, run } from "../shared/repository.ts";
import { build, pin, pinned } from "./index.ts";

async function main(): Promise<void> {
  const rev = process.argv.slice(2).find((arg) => arg !== "--");
  if (rev === undefined) {
    const commit = await pinned();
    if (R.isFailure(commit)) {
      fail(commit.error);
    }

    await build(commit.value);
  } else {
    const { stdout } = await run("git", ["rev-parse", "--verify", `${rev}^{commit}`], {
      cwd: ROOT,
    });
    const commit = stdout.trim();
    await build(commit);
    const pinnedTo = await pin(commit);
    if (R.isFailure(pinnedTo)) {
      fail(pinnedTo.error);
    }
  }
}

function fail(error: Error): never {
  console.error(error.message);
  process.exit(1);
}

await main();
