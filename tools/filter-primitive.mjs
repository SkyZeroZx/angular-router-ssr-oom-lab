// Models what the Router does with a URL-derived query map, without Angular:
// build the map once, the way parseQueryParam() does, then copy it once per
// rendered link, the way createUrlTree()'s "merge" spread and removeEmptyProps()
// do. Only the appended parameter names differ between the two modes.
const FILTER_PARAMS = 2827;
const FILTER_STEP = 17;

const NAMES = Object.freeze({
  candidate: (key) => String(key),
  control: (key) => {
    const text = String(key);
    return text.slice(0, -1) + "abcdefghij"[Number(text.at(-1))];
  },
});

const mode = process.argv[2] ?? "candidate";
const copyCount = Number(process.argv[3]);

if (!Object.hasOwn(NAMES, mode)) {
  throw new Error(`Unsupported mode: ${mode}. Expected "candidate" or "control".`);
}

if (!Number.isSafeInteger(copyCount) || copyCount <= 0) {
  throw new Error(`Copy count must be a positive integer; received ${process.argv[3]}.`);
}

// parseQueryParam(): plain assignment of each decoded name, the page's own
// filters first and the appended names after them.
const params = {};
params["query"] = "running shoes";
params["category"] = "footwear";
params["brand"] = "nike";
params["size"] = "42";
params["color"] = "black";
params["sort"] = "price_asc";
params["page"] = "3";
for (let index = 0; index < FILTER_PARAMS; index += 1) {
  params[NAMES[mode](index * FILTER_STEP)] = "";
}

// One UrlTree per link, each rebuilding the map from the incoming one.
const retainedCopies = [];
for (let index = 0; index < copyCount; index += 1) {
  retainedCopies.push({ ...params, page: String(index) });
}

const { heapUsed, rss } = process.memoryUsage();
console.log(JSON.stringify({ mode, copyCount, heapUsed, rss }));

setTimeout(() => {}, 20);
