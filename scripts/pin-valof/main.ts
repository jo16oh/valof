//   vp run pin-valof          builds the pinned commit; `prepare` runs this after `vp install`
//   vp run pin-valof <rev>    pins <rev>, and builds it
import { ROOT, run } from "../shared/repository.ts";
import { build, pin, pinned } from "./index.ts";

async function main(): Promise<void> {
  const rev = process.argv.slice(2).find((arg) => arg !== "--");
  if (rev === undefined) {
    await build(await pinned());
  } else {
    const { stdout } = await run("git", ["rev-parse", "--verify", `${rev}^{commit}`], {
      cwd: ROOT,
    });
    const commit = stdout.trim();
    await build(commit);
    await pin(commit);
  }
}

await main();
