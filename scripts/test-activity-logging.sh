#!/usr/bin/env bash
# ------------------------------------------------------------
# Test script for the Activity Logging feature in Codely
# ------------------------------------------------------------
# Prerequisites:
#   - The dev server must be running (npm run dev) on http://localhost:3000
#   - jq installed (for pretty‑printing JSON responses)
#   - curl available (included with Git Bash)
#
# This script performs a minimal end‑to‑end verification:
#   0. Fetches a test JWT token
#   1. Creates a snippet (logs snippet.created)
#   2. Updates the snippet (logs snippet.updated)
#   3. Simulates wallet connect (logs wallet.connected)
#   4. Disconnects the wallet (logs wallet.disconnected)
#   5. Deletes the snippet (logs snippet.deleted)
#   6. Queries the /api/logs endpoint and prints the newest entries.
#
# Run it from the project root:
#   ./scripts/test-activity-logging.sh
# ------------------------------------------------------------
set -euo pipefail

BASE_URL="http://localhost:3000"

# Helper to pretty‑print JSON using jq (fallback to cat if missing)
pp() { 
  if command -v jq > /dev/null; then jq .; else cat; fi
}

# -----------------------------------------------------------------
# 0. Get Test Auth Token
# -----------------------------------------------------------------
echo -e "\n=== Fetching Test Auth Token ==="
TOKEN_RESP=$(curl -s "$BASE_URL/api/auth/test-token")
TOKEN=$(echo "$TOKEN_RESP" | jq -r '.token // empty')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Failed to obtain auth token. Response: $TOKEN_RESP" >&2
  exit 1
fi
echo "Obtained Token: $TOKEN"

# -----------------------------------------------------------------
# 1. Create a snippet
# -----------------------------------------------------------------
echo -e "\n=== Creating snippet ==="
CREATE_RESP=$(curl -s -X POST "$BASE_URL/api/snippets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Demo","description":"Demo description","code":"console.log(1)","language":"javascript","tags":["demo"],"ownerWalletAddress":"GDDEMOADDRESS"}')
echo "$CREATE_RESP" | pp
SNIPPET_ID=$(echo "$CREATE_RESP" | jq -r '.id // empty')
if [[ -z "$SNIPPET_ID" || "$SNIPPET_ID" == "null" ]]; then
  echo "Failed to obtain snippet ID – aborting" >&2
  exit 1
fi

# -----------------------------------------------------------------
# 2. Update the snippet
# -----------------------------------------------------------------
echo -e "\n=== Updating snippet $SNIPPET_ID ==="
UPDATE_RESP=$(curl -s -X PUT "$BASE_URL/api/snippets/$SNIPPET_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Demo – edited"}')
echo "$UPDATE_RESP" | pp

# -----------------------------------------------------------------
# 3. Simulate wallet connect – using the auth verify endpoint
# -----------------------------------------------------------------
# Note: Since the verify route checks actual Stellar signatures, 
# this test uses a fake signature. It will fail with 401 but we just 
# want to make sure it doesn't crash the server. 
echo -e "\n=== Simulating wallet connect (Expected to fail signature verification) ==="
CONNECT_RESP=$(curl -s -X POST "$BASE_URL/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"wallet":"GDDEMOADDRESS","signature":"FAKESIGNATURE","nonce":"FAKENONCE"}')
echo "$CONNECT_RESP" | pp

# -----------------------------------------------------------------
# 4. Disconnect the wallet (logout)
# -----------------------------------------------------------------
echo -e "\n=== Logging out ==="
LOGOUT_RESP=$(curl -s -X POST "$BASE_URL/api/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}")
echo "$LOGOUT_RESP" | pp

# -----------------------------------------------------------------
# 5. Delete the snippet
# -----------------------------------------------------------------
echo -e "\n=== Deleting snippet $SNIPPET_ID ==="
DELETE_RESP=$(curl -s -X DELETE "$BASE_URL/api/snippets/$SNIPPET_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$DELETE_RESP" | pp

# -----------------------------------------------------------------
# 6. Query the logs API (most recent 10 entries)
# -----------------------------------------------------------------
echo -e "\n=== Fetching recent activity logs ==="
LOGS_RESP=$(curl -s "$BASE_URL/api/logs?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN")
echo "$LOGS_RESP" | pp

# -----------------------------------------------------------------
# Done – you should see entries for each action performed above.
# -----------------------------------------------------------------
echo -e "\n✅ Test completed. Verify the logs output contains the expected actions."
