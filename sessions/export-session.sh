#!/bin/bash
# Session export script
# Usage: bash sessions/export-session.sh <title-slug> <session-id>
# Creates: sessions/<title-slug>-<session-id-noprefix>.json.bz2
#          sessions/<title-slug>-<session-id-noprefix>.sha256

set -euo pipefail

SLUG="$1"
SESSION_ID="$2"  # includes ses_ prefix
NOPREFIX="${SESSION_ID#ses_}"

echo "Exporting session ${SESSION_ID} as ${SLUG}-${NOPREFIX}"

# Export session to JSON
opencode session export "$SESSION_ID" --format json > "/tmp/${SLUG}-${NOPREFIX}.json" 2>/dev/null || {
    # fallback: session data may not be exportable via CLI, create minimal archive
    echo "Session export via CLI not available; creating minimal archive"
    cat > "/tmp/${SLUG}-${NOPREFIX}.json" <<- JSONEOF
{"session_id": "${SESSION_ID}", "slug": "${SLUG}", "export_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSONEOF
}

# Compress
bzip2 -f "/tmp/${SLUG}-${NOPREFIX}.json"
mv "/tmp/${SLUG}-${NOPREFIX}.json.bz2" "sessions/"

# Hash
sha256sum "sessions/${SLUG}-${NOPREFIX}.json.bz2" | cut -d' ' -f1 > "sessions/${SLUG}-${NOPREFIX}.sha256"

# Verify
bzip2 -t "sessions/${SLUG}-${NOPREFIX}.json.bz2"

echo "Export complete:"
ls -la "sessions/${SLUG}-${NOPREFIX}.json.bz2" "sessions/${SLUG}-${NOPREFIX}.sha256"
