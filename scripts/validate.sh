#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  echo "Usage: $0 [256|512]" >&2
  echo "       $0 [all|control|candidate] [256|512]" >&2
  exit 2
}

MODE="all"
HEAP_MB="256"

case "${1:-}" in
  "") ;;
  256 | 512)
    [[ $# -eq 1 ]] || usage
    HEAP_MB="$1"
    ;;
  all | control | candidate)
    [[ $# -le 2 ]] || usage
    MODE="$1"
    HEAP_MB="${2:-256}"
    ;;
  *) usage ;;
esac

case "$HEAP_MB" in
  256)
    CONCURRENCY=12
    SEGMENTS_PER_REQUEST=742
    PATH_BYTES=8162
    ;;
  512)
    CONCURRENCY=22
    SEGMENTS_PER_REQUEST=742
    PATH_BYTES=8162
    ;;
  *) usage ;;
esac

export HEAP_MB

if [[ "$MODE" == "all" ]]; then
  EVIDENCE_DIR="evidence/run-$HEAP_MB"
else
  EVIDENCE_DIR="evidence/run-$MODE-$HEAP_MB"
fi

OOM_PATTERN='JavaScript heap out of memory|Reached heap limit|FatalProcessOutOfMemory'

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

app_is_running() {
  docker compose ps app --status running --format '{{.Service}}' 2>/dev/null |
    grep -qx app
}

start_fresh_stack() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  docker compose up -d app nginx

  for _ in $(seq 1 60); do
    if docker compose ps app --format json 2>/dev/null | grep -qi healthy &&
      docker compose ps nginx --format json 2>/dev/null | grep -qi healthy; then
      return
    fi
    sleep 1
  done

  docker compose logs app nginx
  fail "Angular and Nginx did not become healthy within 60 seconds."
}

run_control() {
  echo
  echo "== Control: named matrix parameters =="
  start_fresh_stack

  if ! docker compose --profile test run --rm control \
    >"$EVIDENCE_DIR/control-client.log" 2>&1; then
    fail "Control client failed. See $EVIDENCE_DIR/control-client.log."
  fi
  docker compose logs app >"$EVIDENCE_DIR/control-app.log" 2>&1

  local successes
  successes="$({ grep -o '"status":200' "$EVIDENCE_DIR/control-client.log" || true; } | wc -l | tr -d ' ')"

  grep -Fq "\"heapMb\":$HEAP_MB" "$EVIDENCE_DIR/control-client.log" ||
    fail "Control used an unexpected heap profile."
  grep -Fq "\"pathBytes\":$PATH_BYTES" "$EVIDENCE_DIR/control-client.log" ||
    fail "Control used an unexpected path length."
  [[ "$successes" -eq "$CONCURRENCY" ]] ||
    fail "Only $successes/$CONCURRENCY control requests returned HTTP 200."
  app_is_running || fail "Control stopped the Angular worker."
  if grep -Eq "$OOM_PATTERN" "$EVIDENCE_DIR/control-app.log"; then
    fail "Control produced a V8 OOM."
  fi

  echo "[PASS] Control returned $CONCURRENCY/$CONCURRENCY HTTP 200 responses; worker survived."
}

run_candidate() {
  local client_exit
  local container_id

  echo
  echo "== Candidate: numeric matrix parameters =="
  start_fresh_stack

  set +e
  docker compose --profile test run --rm candidate \
    >"$EVIDENCE_DIR/candidate-client.log" 2>&1
  client_exit=$?
  set -e

  sleep 2
  docker compose logs app >"$EVIDENCE_DIR/candidate-app.log" 2>&1 || true

  container_id="$(docker compose ps -a -q app)"
  if [[ -n "$container_id" ]]; then
    docker inspect -f '{{json .State}}' "$container_id" \
      >"$EVIDENCE_DIR/candidate-container-state.json"
  fi

  grep -Fq "\"heapMb\":$HEAP_MB" "$EVIDENCE_DIR/candidate-client.log" ||
    fail "Candidate used an unexpected heap size."
  grep -Fq "\"pathBytes\":$PATH_BYTES" "$EVIDENCE_DIR/candidate-client.log" ||
    fail "Candidate used an unexpected path length."
  grep -Eq "$OOM_PATTERN" "$EVIDENCE_DIR/candidate-app.log" ||
    fail "Candidate did not produce a V8 OOM. See $EVIDENCE_DIR/candidate-app.log."

  if app_is_running; then
    fail "Candidate produced an OOM message but Angular is still running."
  fi
  if grep -Fq '"OOMKilled":true' "$EVIDENCE_DIR/candidate-container-state.json" 2>/dev/null; then
    fail "Docker reports a kernel OOM kill, not a V8 heap-limit failure."
  fi

  echo "[PASS] Candidate reached the $HEAP_MB MiB V8 heap limit (client exit $client_exit)."
}

rm -rf -- "$EVIDENCE_DIR"
mkdir -p "$EVIDENCE_DIR"

printf 'Heap: %s MiB | Requests: %s | Segments/request: %s | Path: %s bytes\n' \
  "$HEAP_MB" "$CONCURRENCY" "$SEGMENTS_PER_REQUEST" "$PATH_BYTES" |
  tee "$EVIDENCE_DIR/plan.txt"

docker compose build app nginx control candidate

case "$MODE" in
  all)
    run_control
    run_candidate
    ;;
  control) run_control ;;
  candidate) run_candidate ;;
esac
