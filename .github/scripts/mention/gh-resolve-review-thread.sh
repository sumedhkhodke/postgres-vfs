#!/usr/bin/env bash
set -euo pipefail

# Resolve a GitHub PR review thread, optionally posting a comment first
#
# Usage:
#   gh-resolve-review-thread.sh THREAD_ID [COMMENT]
#
# Arguments:
#   THREAD_ID - The GraphQL node ID of the review thread
#   COMMENT   - Optional: comment to post before resolving
#
# Environment:
#   MENTION_REPO      - Repository (owner/repo)
#   MENTION_PR_NUMBER - Pull request number

: "${MENTION_REPO:?MENTION_REPO environment variable is required}"
: "${MENTION_PR_NUMBER:?MENTION_PR_NUMBER environment variable is required}"
THREAD_ID="${1:?Thread ID required}"
COMMENT="${2:-}"

if [ -n "$COMMENT" ]; then
  echo "Posting comment to thread..." >&2
  COMMENT_RESULT=$(gh api graphql -f query='
    mutation($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: {
        pullRequestReviewThreadId: $threadId,
        body: $body
      }) {
        comment {
          id
        }
      }
    }' -f threadId="$THREAD_ID" -f body="$COMMENT")
  if echo "$COMMENT_RESULT" | jq -e '.errors' > /dev/null 2>&1; then
    echo "Error posting comment: $COMMENT_RESULT" >&2
    exit 1
  fi
fi

echo "Resolving thread..." >&2
RESOLVE_RESULT=$(gh api graphql -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread {
        id
        isResolved
      }
    }
  }' -f threadId="$THREAD_ID" --jq '.data.resolveReviewThread.thread')

echo "$RESOLVE_RESULT"
echo "Thread resolved" >&2
