#!/bin/bash
# pr-review.sh - Submit a PR review with queued inline comments
#
# Usage: pr-review.sh <APPROVE|REQUEST_CHANGES|COMMENT> [review-body]
#
# Environment variables:
#   PR_REVIEW_REPO          - Repository (owner/repo)
#   PR_REVIEW_PR_NUMBER     - Pull request number
#   PR_REVIEW_HEAD_SHA      - HEAD commit SHA
#   PR_REVIEW_COMMENTS_DIR  - Directory containing queued comments (default: /tmp/pr-review-comments)

set -e

REPO="${PR_REVIEW_REPO:?PR_REVIEW_REPO environment variable is required}"
PR_NUMBER="${PR_REVIEW_PR_NUMBER:?PR_REVIEW_PR_NUMBER environment variable is required}"
HEAD_SHA="${PR_REVIEW_HEAD_SHA:?PR_REVIEW_HEAD_SHA environment variable is required}"
COMMENTS_DIR="${PR_REVIEW_COMMENTS_DIR:-/tmp/pr-review-comments}"

EVENT="$1"
shift 2>/dev/null || true
BODY="$*"

if [ -z "$EVENT" ]; then
  echo "Usage: pr-review.sh <APPROVE|REQUEST_CHANGES|COMMENT> [review-body]"
  exit 1
fi

case "$EVENT" in
  APPROVE|REQUEST_CHANGES|COMMENT) ;;
  *)
    echo "Error: Invalid event type '${EVENT}'. Must be: APPROVE, REQUEST_CHANGES, COMMENT"
    exit 1
    ;;
esac

COMMENTS="[]"
COMMENT_COUNT=0

if [ -d "${COMMENTS_DIR}" ]; then
  COMMENT_FILES=("${COMMENTS_DIR}"/comment-*.json)

  if [ -f "${COMMENT_FILES[0]}" ]; then
    COMMENTS=$(jq -s '[.[] | del(._meta)]' "${COMMENTS_DIR}"/comment-*.json)
    COMMENT_COUNT=$(echo "$COMMENTS" | jq 'length')
    if [ "$COMMENT_COUNT" -gt 0 ]; then
      echo "Found ${COMMENT_COUNT} queued inline comment(s)"
    fi
  fi
fi

FOOTER='

---
mister-meow | Type `@mister-meow` to interact further'

if [ -n "$BODY" ]; then
  BODY_WITH_FOOTER="${BODY}${FOOTER}"
else
  BODY_WITH_FOOTER=""
fi

REVIEW_JSON=$(jq -n \
  --arg commit_id "$HEAD_SHA" \
  --arg event "$EVENT" \
  --arg body "$BODY_WITH_FOOTER" \
  --argjson comments "$COMMENTS" \
  '{
    commit_id: $commit_id,
    event: $event,
    comments: $comments
  } + (if $body != "" then {body: $body} else {} end)')

CURRENT_HEAD=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" --jq '.head.sha')
if [ "$CURRENT_HEAD" != "$HEAD_SHA" ]; then
  echo "WARNING: PR head has changed since review started!"
  echo "  Review started at: ${HEAD_SHA:0:7}"
  echo "  Current head:      ${CURRENT_HEAD:0:7}"
  echo ""
fi

echo "Submitting ${EVENT} review for commit ${HEAD_SHA:0:7}..."

TEMP_JSON=$(mktemp)
trap "rm -f ${TEMP_JSON}" EXIT
echo "$REVIEW_JSON" > "${TEMP_JSON}"

RESPONSE=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}/reviews" \
  -X POST \
  --input "${TEMP_JSON}" 2>&1) || {
  echo "Error submitting review:"
  echo "$RESPONSE"
  exit 1
}

if [ -d "${COMMENTS_DIR}" ] && [ "$COMMENT_COUNT" -gt 0 ]; then
  rm -f "${COMMENTS_DIR}"/comment-*.json
  rmdir "${COMMENTS_DIR}" 2>/dev/null || true
fi

REVIEW_URL=$(echo "$RESPONSE" | jq -r '.html_url // empty')
REVIEW_STATE=$(echo "$RESPONSE" | jq -r '.state // empty')

if [ -n "$REVIEW_URL" ]; then
  echo "Review submitted (${REVIEW_STATE}): ${REVIEW_URL}"
  if [ "$COMMENT_COUNT" -gt 0 ]; then
    echo "  Included ${COMMENT_COUNT} inline comment(s)"
  fi
else
  echo "Review submitted successfully"
fi
