import { WORKLOADS, workloadFor } from "./workloads.mjs";

const shape = process.env.SHAPE ?? "matrix";
const heapMb = Number(process.argv[2] ?? process.env.HEAP_MB ?? "256");
const workload = workloadFor(heapMb, shape);

const plan = {
  shape,
  heapMb,
  ...workload,
  supportedHeaps: Object.keys(WORKLOADS[shape]).map(Number),
  supportedShapes: Object.keys(WORKLOADS),
};

if (shape === "matrix") {
  const segmentBytes = Buffer.byteLength("/a;990;2522");
  plan.segmentBytes = segmentBytes;
  plan.pathBytes = workload.segmentsPerRequest * segmentBytes;
  plan.totalSegments = workload.segmentsPerRequest * workload.concurrency;
}

console.log(JSON.stringify(plan, null, 2));
