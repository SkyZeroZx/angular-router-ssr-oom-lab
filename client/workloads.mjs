// Matrix workloads spend the whole request line on repeated segments, so the
// cost is carried by the URL itself. The filter workload keeps the request to a
// size any proxy accepts and lets the page's links rebuild the query map once
// per link, so the cost is carried by the render and concurrency scales it.
//
// filterStep is the spacing between the appended numeric names. V8 keeps
// extending one dense elements store only while each new index stays close to
// the current capacity, so the spacing is what keeps the store growing.
export const WORKLOADS = Object.freeze({
  matrix: Object.freeze({
    256: Object.freeze({ segmentsPerRequest: 1488, concurrency: 6 }),
    512: Object.freeze({ segmentsPerRequest: 1488, concurrency: 12 }),
  }),
  // filterStep is the spacing between the appended names. V8 keeps extending
  // one dense elements store only while each new index stays close to the
  // current capacity, and 17 is the widest spacing that still does, measured.
  filter: Object.freeze({
    256: Object.freeze({ concurrency: 6, pathBytes: 16368, filterStep: 17 }),
    512: Object.freeze({ concurrency: 16, pathBytes: 16368, filterStep: 17 }),
  }),
});

export function workloadFor(heapMb, shape = "matrix") {
  const byHeap = WORKLOADS[shape];

  if (!byHeap) {
    throw new Error(
      `Unsupported shape: ${shape}. Expected one of: ${Object.keys(WORKLOADS).join(", ")}.`,
    );
  }

  const workload = byHeap[heapMb];

  if (!workload) {
    throw new Error(
      `Unsupported heap size for ${shape}: ${heapMb} MiB. Expected one of: ${Object.keys(byHeap).join(", ")} MiB.`,
    );
  }

  return workload;
}
