POC with everything needed to reproduce it:
https://github.com/SkyZeroZx/angular-router-ssr-oom-lab/tree/query-param-oom-angular-22.2.0

22.2.0 is the first stable release with #70717 in it, and the matrix path is
properly dead there: 30,529 bytes per segment down to 261, and the 16 KiB URL
that used to take out a 256 MiB worker in 4 requests now answers 6/6 HTTP 200.

`parseQueryParam()` never got the same treatment, it still does
`params[decodedKey] = decodedVal`. `?0&17&34` becomes
`{ "0": "", "17": "", "34": "" }`, which V8 backs with a dense elements store
sized to the largest index: 558,465 bytes, against 196,704 for the same names as
strings.

One of those per request is cheap. It gets expensive because the Router rebuilds
the map every time it builds a URL, once through a spread and again through
`removeEmptyProps()`, neither guarded. An app turns that on with one line,
`withRouterConfig({ defaultQueryParamsHandling: 'merge' })`, and from there every
URL it builds carries the query string the page was loaded with. The category
page in the repro reads none of the names.

Angular 22.2.0 on Node 24, an ordinary category page rendering 100 links, 2,827
numeric names spaced 17 apart in a 16,365-byte request line:

| V8 old space | Survives | First OOM | Control, same bytes |
| -----------: | -------: | --------: | ------------------- |
|      256 MiB |        3 |         4 | 6/6 HTTP 200        |
|      512 MiB |        8 |        10 | 16/16 HTTP 200      |

55.8 MB of heap per request against the control's 19.7 MB.

Same request line as the matrix vector, so they line up. Matrix re-measured on a
rebuilt 22.1.4 image, same machine, same Nginx:

| V8 old space | matrix `;` 22.1.4 | query `?` 22.2.0 |
| -----------: | ----------------: | ---------------: |
|      256 MiB |                 4 |                4 |
|      512 MiB |                10 |               10 |

The same price out of a URL the same size, on the release that fixed the first
one. The 16 KiB request line an ALB gives you doesn't prevent this one either,
it only sets the price again.

Links are what move it:

| Links on the page | Requests to OOM, 256 MiB | 512 MiB |
| ----------------: | -----------------------: | ------: |
|                30 |                       16 |         |
|                50 |                        8 |      20 |
|                75 |                        6 |      12 |
|               100 |                        4 |      10 |

`links x requests` of about 440 at 256 MiB and 960 at 512, with the control 2.8x
behind throughout.

`OOMKilled=false` in all of them, so this is V8 hitting its limit, not the
container being reaped.

Two things it isn't. The numbers are picked, not natural — V8 only keeps the
dense store while each new index lands within ~1,024 of the current capacity, so
`?2020=on&2024=on` is 209 B a rebuild and `?1000001=1` is 210 B. Small record ids
under 1,024 are the exception at 5,688 B, about 200x ordinary, with nobody
attacking anything. And a page that builds no URLs is a different bug: it
survived 256 requests at 256 MiB, and the only way it falls over is with no proxy
and a 1.1 MB query, where the string control follows two requests behind.
