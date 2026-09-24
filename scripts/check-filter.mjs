import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Total query-map copies a run materializes: links per render x concurrent
// requests, matching client/workloads.mjs and the app's link-count defaults
// (48 products + 40 facets + 8 sort and pager links).
const LINKS_PER_RENDER = 100;
const PROFILES = Object.freeze({
  256: LINKS_PER_RENDER * 6,
  512: LINKS_PER_RENDER * 16,
});
const OOM_PATTERN =
  /JavaScript heap out of memory|Reached heap limit|FatalProcessOutOfMemory/;
const target = process.argv[2] ?? "all";

if (target !== "all" && !Object.hasOwn(PROFILES, target)) {
  throw new Error("Usage: node scripts/check-filter.mjs [256|512|all]");
}

const logDirectory = join(tmpdir(), "angular-router-filter-check");
mkdirSync(logDirectory, { recursive: true });

function run(heapMb, copies, mode, attempt = 1) {
  const result = spawnSync(
    process.execPath,
    [`--max-old-space-size=${heapMb}`, "tools/filter-primitive.mjs", mode, String(copies)],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );

  const output = [result.stdout, result.stderr, result.error?.stack]
    .filter(Boolean)
    .join("\n");
  const logFile = join(logDirectory, `${heapMb}-${mode}-${attempt}.log`);
  writeFileSync(logFile, output);

  return {
    exitedNormally: result.status === 0,
    hasV8Oom: OOM_PATTERN.test(output),
    logFile,
  };
}

let failed = false;
const selectedProfiles =
  target === "all" ? Object.entries(PROFILES) : [[target, PROFILES[target]]];

for (const [heapMb, copies] of selectedProfiles) {
  const candidates = [1, 2, 3].map((attempt) =>
    run(heapMb, copies, "candidate", attempt),
  );
  const control = run(heapMb, copies, "control");
  const oomCount = candidates.filter((result) => result.hasV8Oom).length;

  if (oomCount === 3 && control.exitedNormally && !control.hasV8Oom) {
    console.log(`[PASS] ${heapMb} MiB, ${copies} copies: candidate OOM 3/3; control survived.`);
    continue;
  }

  failed = true;
  console.error(
    `[FAIL] ${heapMb} MiB, ${copies} copies: candidate OOM ${oomCount}/3; control survived: ${control.exitedNormally && !control.hasV8Oom}.`,
  );
  console.error(`Logs: ${logDirectory}`);
}

if (failed) {
  process.exitCode = 1;
}
