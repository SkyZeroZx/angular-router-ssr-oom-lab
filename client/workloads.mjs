export const WORKLOADS = Object.freeze({
  256: Object.freeze({ segmentsPerRequest: 1488, concurrency: 6 }),
  512: Object.freeze({ segmentsPerRequest: 1488, concurrency: 12 }),
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
