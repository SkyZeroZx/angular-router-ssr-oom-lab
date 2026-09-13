import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PROFILES = Object.freeze({
  256: 10_388,
  512: 16_324,
});
const OOM_PATTERN =
  /JavaScript heap out of memory|Reached heap limit|FatalProcessOutOfMemory/;
const target = process.argv[2] ?? "all";

if (target !== "all" && !Object.hasOwn(PROFILES, target)) {
  throw new Error("Usage: node scripts/check-v8.mjs [256|512|all]");
}

const logDirectory = join(tmpdir(), "angular-router-v8-check");
mkdirSync(logDirectory, { recursive: true });

function run(heapMb, totalSegments, mode, attempt = 1) {
  const result = spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${heapMb}`,
      "tools/v8-primitive.mjs",
      mode,
      String(totalSegments),
    ],
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

for (const [heapMb, totalSegments] of selectedProfiles) {
  const candidates = [1, 2, 3].map((attempt) =>
    run(heapMb, totalSegments, "candidate", attempt),
  );
  const control = run(heapMb, totalSegments, "control");
  const oomCount = candidates.filter((result) => result.hasV8Oom).length;

  if (oomCount === 3 && control.exitedNormally && !control.hasV8Oom) {
    console.log(
      `[PASS] ${heapMb} MiB: candidate OOM 3/3; control survived.`,
    );
    continue;
  }

  failed = true;
  console.error(
    `[FAIL] ${heapMb} MiB: candidate OOM ${oomCount}/3; control survived: ${control.exitedNormally && !control.hasV8Oom}.`,
  );
  console.error(`Logs: ${logDirectory}`);
}

if (failed) {
  process.exitCode = 1;
}
