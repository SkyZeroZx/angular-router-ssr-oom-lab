export const WORKLOADS = Object.freeze({
  256: Object.freeze({ segmentsPerRequest: 742, concurrency: 12 }),
  512: Object.freeze({ segmentsPerRequest: 742, concurrency: 22 }),
});

export function workloadFor(heapMb) {
  const workload = WORKLOADS[heapMb];

  if (!workload) {
    const supportedHeaps = Object.keys(WORKLOADS).join(", ");
    throw new Error(
      `Unsupported heap size: ${heapMb} MiB. Expected one of: ${supportedHeaps} MiB.`,
    );
  }

  return workload;
}
