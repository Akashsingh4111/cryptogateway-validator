#!/usr/bin/env bash
set -e
BASE="http://localhost:3000"

echo "=== 1. Health check ==="
curl -s "$BASE/api/health" | sed 's/^/  /'
echo
echo

echo "=== 2. Starting a job ==="
RESPONSE=$(curl -s -X POST "$BASE/api/run" \
  -H 'Content-Type: application/json' \
  -d '{"intent":"Test ETH wallet balance retrieval on Sepolia for a payment gateway, with 3 scenarios."}')
echo "  $RESPONSE"
JOB_ID=$(echo "$RESPONSE" | sed -n 's/.*"jobId":\([0-9]*\).*/\1/p')
if [ -z "$JOB_ID" ]; then
  echo "  [error] could not parse jobId"
  exit 1
fi
echo "  jobId=$JOB_ID"
echo

echo "=== 3. Polling status every 2s ==="
for i in $(seq 1 20); do
  STATUS=$(curl -s "$BASE/api/status/$JOB_ID")
  STAGE=$(echo "$STATUS" | sed -n 's/.*"stage":"\([^"]*\)".*/\1/p')
  ELAPSED=$(echo "$STATUS" | sed -n 's/.*"elapsedMs":\([0-9]*\).*/\1/p')
  echo "  [$i] stage=$STAGE elapsed=${ELAPSED}ms"
  if [ "$STAGE" = "complete" ] || [ "$STAGE" = "failed" ]; then
    echo
    echo "=== final response (truncated) ==="
    echo "$STATUS" | head -c 800
    echo "..."
    exit 0
  fi
  sleep 2
done

echo "  [timeout] did not complete in 40s"
exit 1