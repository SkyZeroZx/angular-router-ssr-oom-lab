const KEYS = Object.freeze({
  candidate: ["990", "2522"],
  control: ["aaa", "bbbb"],
});

const mode = process.argv[2] ?? "candidate";
const objectCount = Number(process.argv[3]);

if (!Object.hasOwn(KEYS, mode)) {
  throw new Error(`Unsupported mode: ${mode}. Expected "candidate" or "control".`);
}

if (!Number.isSafeInteger(objectCount) || objectCount <= 0) {
  throw new Error(`Object count must be a positive integer; received ${process.argv[3]}.`);
}

const retainedObjects = [];
const [firstKey, secondKey] = KEYS[mode];

for (let index = 0; index < objectCount; index += 1) {
  const value = {};
  value[firstKey] = "";
  value[secondKey] = "";
  retainedObjects.push(value);
}

const { heapUsed, rss } = process.memoryUsage();
console.log(JSON.stringify({ mode, objectCount, heapUsed, rss }));

setTimeout(() => {}, 20);
