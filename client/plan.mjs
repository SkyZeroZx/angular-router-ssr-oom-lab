import { WORKLOADS, workloadFor } from "./workloads.mjs";

const CANDIDATE_SEGMENT = "/a;990;2522";
const heapMb = Number(process.argv[2] ?? process.env.HEAP_MB ?? "256");
const workload = workloadFor(heapMb);
const segmentBytes = Buffer.byteLength(CANDIDATE_SEGMENT);

const plan = {
  heapMb,
  ...workload,
  segmentBytes,
  pathBytes: workload.segmentsPerRequest * segmentBytes,
  totalSegments: workload.segmentsPerRequest * workload.concurrency,
  supportedHeaps: Object.keys(WORKLOADS).map(Number),
};

console.log(JSON.stringify(plan, null, 2));
