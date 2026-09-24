# Angular Router numeric query-parameter OOM

Minimal reproduction of an Angular Router out-of-memory failure during
server-side rendering (SSR).

```text
Candidate: /products?...&0&17&34&51   numeric query-parameter names
Control:   /products?...&a&1h&3e&5a   normal string names
```

Both URLs are the same size and carry the same number of parameters. Under
concurrent SSR requests the candidate exhausts the V8 heap while the control
stays healthy.

`?0&17&34` becomes `{ "0": "", "17": "", "34": "" }`. V8 treats integer-like keys
as array indices and backs the object with a dense elements store sized to the
largest index, so that object costs 558,465 bytes where the control's costs
196,704.

The same mechanism on matrix parameters was
[#70716](https://github.com/angular/angular/issues/70716), fixed by
[#70717](https://github.com/angular/angular/pull/70717) and no longer reproducing
as of 22.2.0; `parseQueryParam()` was not part of that fix and still does
`params[decodedKey] = decodedVal`.

## Preserving the filter

One query map per request is cheap. What costs is that the Router rebuilds it
every time it builds a URL, once through a spread and again through
`removeEmptyProps()`, neither of them guarded:

```js
// Router.createUrlTree
q = { ...this.currentUrlTree.queryParams, ...queryParams };
if (q !== null) q = this.removeEmptyProps(q);   // Object.entries().reduce()
```

The application asks for that once, in `app.config.ts`:

```ts
provideRouter(routes, withRouterConfig({ defaultQueryParamsHandling: "merge" }))
```

That's the documented way to make filter state survive navigation — the Router
replaces query parameters otherwise. From there every URL the app builds carries
the query string it was loaded with, including names the app has never heard of.
`/products` is an ordinary category page and reads none of them.

## Workload

```text
/products?query=running+shoes&category=footwear&brand=nike&size=42&color=black
         &sort=price_asc&page=3&0&17&34&51&68&85&...&47923
```

2,827 names spaced 17 apart, no values, in a 16,365-byte request line. The
control is the same bytes and the same count with the last digit of each name
swapped for a letter (`0`→`a`, `17`→`1h`), enough to stop V8 reading it as an
index. Dropping the values fits 2,827 names into the request line instead of
2,090, and that pushes the usable spacing from 11 to 17; at 18 V8 gives up and
falls back to dictionary mode.

The page renders 100 links: 48 products, 44 facets, a sort control and a pager.
`OOMKilled=false` in all of them, so this is V8 hitting its limit, not the
container being reaped.

| V8 old space | Survives | First OOM | Workload used | Control |
| -----------: | -------: | --------: | ------------: | ------- |
| 256 MiB | 3 requests | 4 requests | 6, OOM 3/3 | 6/6 HTTP 200 |
| 512 MiB | 8 requests | 10 requests | 16, OOM 2/2 | 16/16 HTTP 200 |

558,465 bytes per rebuild against 196,704 for the same count of string names, so
a request costs 55.8 MB instead of 19.7 MB. Same counts whether the client runs
as a Compose service on the Docker network, on the Windows host over the
published port, or in WSL2 over the published port.

## What it costs against the matrix vector

Same request line, so they line up directly. Matrix was re-measured on a rebuilt
22.1.4 image, same machine, same Nginx, since it doesn't reproduce on 22.2.0 any
more.

| V8 old space | matrix `;`, 22.1.4 | query `?`, 22.2.0 |
| -----------: | -----------------: | ----------------: |
| 256 MiB | 4 requests | 4 requests |
| 512 MiB | 10 requests | 10 requests |

The same price out of a URL the same size. The 16 KiB request line an ALB gives
you doesn't prevent this one either, it only sets the price again.

How many links the page renders is what moves it:

| Links on the page | Requests to OOM, 256 MiB | 512 MiB |
| ----------------: | -----------------------: | ------: |
| 30 | 16 | |
| 50 | 8 | 20 |
| 75 | 6 | 12 |
| 100 | 4 | 10 |

It comes out at `links x requests` of about 440 at 256 MiB and 960 at 512, so it
scales straight with the heap.

The control tracks 2.8x behind throughout, which is the ratio between the two
objects. Past a few hundred links the page gets heavy enough that the control
starts falling over too, and the comparison stops saying anything about the
names.

## Where this stops

The numbers are picked, not natural. V8 only keeps the dense store while each new
index lands within about 1,024 of the current capacity, so ids that show up on
their own cost nothing: `?2020=on&2024=on` is 209 B a rebuild, `?1000001=1`
210 B, `qs` array indices 216 B. The one that does bite is small record ids under
1,024, where `?123=1&456=1` runs 5,688 B, roughly 200x ordinary, with nobody
attacking anything.

It also needs the app to build URLs. `/filters` holds the same query string and
builds none, and it survived 256 requests at 256 MiB. With no proxy in front and
a 1.1 MB query it does fall over at 8 requests, but the string control follows at
16, so that one is an unbounded query string rather than this.

## Automated test

Starts fresh containers, runs the control, triggers the candidate, and confirms
Docker did not kill the container. Evidence lands in `evidence/run-<shape>-<heap>/`.

```bash
SHAPE=filter ./scripts/validate.sh 256
SHAPE=filter ./scripts/validate.sh 512
```

Optional V8-only check. It models the allocation on its own and doesn't depend on
the Angular version:

```bash
node scripts/check-filter.mjs all
```

## Manual test

The candidate intentionally crashes the SSR worker. Use only this disposable
local stack.

```bash
HEAP_MB=256 docker compose up -d --build --wait app nginx
HEAP_MB=256 SHAPE=filter TARGET_URL=http://127.0.0.1:8080 node client/send.mjs
```

Confirm the V8 failure:

```bash
docker compose logs app | grep -E 'Reached heap limit|JavaScript heap out of memory'
docker inspect "$(docker compose ps -a -q app)" --format '{{.State.OOMKilled}}'
```

Expected: a V8 heap error and `false`. `false` proves the kernel did not kill the
container. To run the harmless control:

```bash
HEAP_MB=256 SHAPE=filter docker compose run --rm --build control
```

## Without a proxy

`client/direct.mjs` reaches Angular on the Compose network, so only Node's own
limit applies and the query can be as large as `--max-http-header-size` allows.
It's the only way `/filters`, which builds no URLs at all, falls over:

```bash
HEAP_MB=512 MAX_HTTP_HEADER_SIZE=4194304 docker compose up -d --wait app
MAX_HTTP_HEADER_SIZE=4194304 docker compose --profile test run --rm \
  -e SHAPE=nolinks -e PARAMS=120000 -e CONCURRENCY=8 direct
```

Add `-e MODE=control` for the equal-size control, which needs 16 requests instead
of 8.

## Workloads

| Heap | Requests | Links per render | Names per request | Path size |
| ---: | -------: | ---------------: | ----------------: | --------: |
| 256 MiB | 6 | 100 | 2,827 | 16,365 B |
| 512 MiB | 16 | 100 | 2,827 | 16,365 B |

`PRODUCT_LINKS`, `BRAND_LINKS`, `COLOUR_LINKS`, `SIZE_LINKS`, `PRICE_LINKS`,
`SORT_LINKS` and `PAGE_LINKS` set what `/products` renders: 48, 20, 12, 8, 4, 4
and 4. `/filters` builds none. Each request is held for `RESOLVER_HOLD_MS`,
1,000 ms by default, by the reproduction's route resolver, so concurrent requests
overlap. A production resolver renders, runs its own operations and waits on API
calls before the response goes out, and a longer hold keeps more UrlTrees live at
once.

Nginx 1.31.5 uses a small production-like reverse-proxy configuration:

- HTTP/2 from the client and HTTP/1.1 keepalive to Angular.
- Standard forwarded headers, and a 30 s `proxy_read_timeout`.
- Health checks before requests start.
- `large_client_header_buffers 4 16k`, matching the AWS Elastic Load Balancer
  request line.

Angular 22.2.0 (`@angular/ssr` 22.1.8), TypeScript 6.0.3, Node 24.21.0 in the
image, Docker 29.7.2.

## Clean up

```bash
docker compose down -v --remove-orphans
```

Only Nginx is exposed, at `127.0.0.1:8080`. Angular remains inside the Compose
network.
