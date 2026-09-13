import http2 from "node:http2";
import { workloadFor } from "./workloads.mjs";

const target = new URL(
  process.env.TARGET_URL ?? "http://127.0.0.1:8080",
);
const REQUEST_TIMEOUT_MS = 20_000;
const SEGMENTS = Object.freeze({
  candidate: "/a;990;2522",
  control: "/a;aaa;bbbb",
});

const mode = process.env.MODE ?? "candidate";
if (!Object.hasOwn(SEGMENTS, mode)) {
  throw new Error(`Unsupported MODE=${mode}. Expected "candidate" or "control".`);
}

const heapMb = Number(process.env.HEAP_MB ?? "256");
const { segmentsPerRequest, concurrency } = workloadFor(heapMb);
const segment = SEGMENTS[mode];
if (!["http:", "https:"].includes(target.protocol)) {
  throw new Error("TARGET_URL must use http:// or https://.");
}
if (target.pathname !== "/" || target.search || target.hash) {
  throw new Error("TARGET_URL must contain only the deployment origin.");
}

const path = segment.repeat(segmentsPerRequest);
const pathBytes = Buffer.byteLength(path);
const authority = target.host;

console.log(
  JSON.stringify({
    mode,
    heapMb,
    transport: "node:http2",
    segmentsPerRequest,
    concurrency,
    totalSegments: segmentsPerRequest * concurrency,
    pathBytes,
    destination: target.origin,
    authority,
  }),
);

const session = http2.connect(target.origin);
const deadline = setTimeout(() => {
  console.error(`Request deadline exceeded after ${REQUEST_TIMEOUT_MS} ms.`);
  session.destroy();
}, REQUEST_TIMEOUT_MS);

function sendRequest(index) {
  return new Promise((resolve) => {
    let status = null;
    let bytes = 0;

    const req = session.request({
      ":method": "GET",
      ":scheme": target.protocol.slice(0, -1),
      ":authority": authority,
      ":path": path,
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => {
      bytes += chunk.length;
    });
    req.on("end", () => resolve({ index, status, bytes, ended: true }));
    req.on("error", (error) => {
      resolve({
        index,
        error: error.code ?? error.message,
        ended: false,
      });
    });
    req.end();
  });
}

session.on("error", (error) => {
  console.log(JSON.stringify({ sessionError: error.code ?? error.message }));
});

const results = await Promise.all(
  Array.from({ length: concurrency }, (_, index) => sendRequest(index)),
);

clearTimeout(deadline);
if (!session.closed && !session.destroyed) {
  session.close();
}
console.log(JSON.stringify({ mode, heapMb, results }));
