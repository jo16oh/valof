import { forEachVersion, pack, root, run, supported } from "../typescript-lines.ts";

const project = "scripts/ts-compatibility/tsconfig.json";

await pack();

const failed: string[] = [];

await forEachVersion(await supported(), async (tsc, version) => {
  try {
    await run(tsc, ["-p", project], { cwd: root });
    console.log(`  typescript@${version}  pass`);
  } catch (error) {
    failed.push(version);
    console.log(`  typescript@${version}  fail`);
    console.log(`${(error as { stdout?: string }).stdout ?? String(error)}`);
  }
});

console.log();

if (failed.length > 0) {
  console.error(`the declarations do not typecheck on ${failed.join(", ")}`);
  process.exit(1);
}
