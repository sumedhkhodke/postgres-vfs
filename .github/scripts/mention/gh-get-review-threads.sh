#!/usr/bin/env bash
set -euo pipefail

# Get PR review threads via GitHub GraphQL API
#
# Usage:
#   gh-get-review-threads.sh [FILTER]
#
# Arguments:
#   FILTER - Optional: filter for unresolved threads from specific author
#
# Environment:
#   MENTION_REPO      - Repository (owner/repo)
#   MENTION_PR_NUMBER - Pull request number

REPO_FULL="${MENTION_REPO:?MENTION_REPO environment variable is required}"
OWNER="${REPO_FULL%/*}"
REPO="${REPO_FULL#*/}"
PR_NUMBER="${MENTION_PR_NUMBER:?MENTION_PR_NUMBER environment variable is required}"
FILTER="${1:-}"

gh api graphql -f query='
  query($owner: String!, $repo: String!, $prNumber: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $prNumber) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 50) {
              nodes {
                id
                body
                author { login }
                createdAt
              }
            }
          }
        }
      }
    }
  }' -F owner="$OWNER" \
     -F repo="$REPO" \
     -F prNumber="$PR_NUMBER" \
     --jq '.data.repository.pullRequest.reviewThreads.nodes' | \
if [ -n "$FILTER" ]; then
  jq --arg author "$FILTER" '
    map(select(
      .isResolved == false and
      .comments.nodes | any(.author.login == $author)
    ))'
else
  cat
fi
