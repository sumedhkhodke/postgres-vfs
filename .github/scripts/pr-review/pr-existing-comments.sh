#!/bin/bash
# pr-existing-comments.sh - Fetch existing review threads on a PR
#
# Usage:
#   pr-existing-comments.sh              - Show all review threads
#   pr-existing-comments.sh --summary    - Show per-file summary only
#   pr-existing-comments.sh --unresolved - Show only unresolved threads
#   pr-existing-comments.sh --file <path> - Show threads for a specific file
#   pr-existing-comments.sh --full       - Show full comment text (no truncation)
#
# Environment variables:
#   PR_REVIEW_REPO       - Repository (owner/repo)
#   PR_REVIEW_PR_NUMBER  - Pull request number

set -e

REPO="${PR_REVIEW_REPO:?PR_REVIEW_REPO environment variable is required}"
PR_NUMBER="${PR_REVIEW_PR_NUMBER:?PR_REVIEW_PR_NUMBER environment variable is required}"

OWNER="${REPO%/*}"
REPO_NAME="${REPO#*/}"

FILTER_UNRESOLVED=false
FILTER_FILE=""
SUMMARY_ONLY=false
FULL_TEXT=false

while [ $# -gt 0 ]; do
  case "$1" in
    --unresolved) FILTER_UNRESOLVED=true; shift ;;
    --file) FILTER_FILE="$2"; shift 2 ;;
    --summary) SUMMARY_ONLY=true; shift ;;
    --full) FULL_TEXT=true; shift ;;
    *)
      echo "Usage: pr-existing-comments.sh [--summary] [--unresolved] [--file <path>] [--full]"
      exit 1
      ;;
  esac
done

THREADS=$(gh api graphql -f query='
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
            originalLine
            startLine
            originalStartLine
            diffSide
            comments(first: 50) {
              nodes {
                id
                body
                author { login }
                createdAt
                originalCommit { abbreviatedOid }
              }
            }
          }
        }
      }
    }
  }' -F owner="$OWNER" \
     -F repo="$REPO_NAME" \
     -F prNumber="$PR_NUMBER" \
     --jq '.data.repository.pullRequest.reviewThreads.nodes')

if [ -z "$THREADS" ] || [ "$THREADS" = "null" ]; then
  echo "No existing review threads found."
  exit 0
fi

FILTERED="$THREADS"

if [ "$FILTER_UNRESOLVED" = true ]; then
  FILTERED=$(echo "$FILTERED" | jq '[.[] | select(.isResolved == false)]')
fi

if [ -n "$FILTER_FILE" ]; then
  FILTERED=$(echo "$FILTERED" | jq --arg file "$FILTER_FILE" '[.[] | select(.path == $file)]')
fi

THREAD_COUNT=$(echo "$FILTERED" | jq 'length')

if [ "$THREAD_COUNT" -eq 0 ]; then
  if [ "$FILTER_UNRESOLVED" = true ]; then
    echo "No unresolved review threads found."
  elif [ -n "$FILTER_FILE" ]; then
    echo "No review threads found for ${FILTER_FILE}."
  else
    echo "No existing review threads found."
  fi
  exit 0
fi

RESOLVED_COUNT=$(echo "$FILTERED" | jq '[.[] | select(.isResolved == true)] | length')
UNRESOLVED_COUNT=$(echo "$FILTERED" | jq '[.[] | select(.isResolved == false)] | length')
OUTDATED_COUNT=$(echo "$FILTERED" | jq '[.[] | select(.isOutdated == true)] | length')

echo "Existing review threads: ${THREAD_COUNT} total (${UNRESOLVED_COUNT} unresolved, ${RESOLVED_COUNT} resolved, ${OUTDATED_COUNT} outdated)"
echo ""

if [ "$SUMMARY_ONLY" = true ]; then
  echo "Threads by file:"
  echo "$FILTERED" | jq -r '
    group_by(.path) | .[] |
    . as $threads |
    ($threads | length) as $total |
    ([$threads[] | select(.isResolved == false)] | length) as $unresolved |
    ([$threads[] | select(.isResolved == true)] | length) as $resolved |
    ([$threads[] | select(.isOutdated == true)] | length) as $outdated |
    ([$threads[] | select(.comments.nodes | length > 1)] | length) as $has_replies |
    "  " + $threads[0].path +
    " -- " + ($total | tostring) + " threads" +
    " (" + ($unresolved | tostring) + " unresolved, " + ($resolved | tostring) + " resolved" +
    (if $outdated > 0 then ", " + ($outdated | tostring) + " outdated" else "" end) +
    ")" +
    (if $has_replies > 0 then " " + ($has_replies | tostring) + " with replies" else "" end)
  '
  echo ""
  echo "Use: pr-existing-comments.sh --file <path>  to see full thread details for a file"
  exit 0
fi

FIRST_LIMIT=200
REPLY_LIMIT=300
if [ "$FULL_TEXT" = true ]; then
  FIRST_LIMIT=999999
  REPLY_LIMIT=999999
fi

echo "$FILTERED" | jq -r --argjson first_limit "$FIRST_LIMIT" --argjson reply_limit "$REPLY_LIMIT" '
  group_by(.path) | .[] |
  "## " + .[0].path + " (" + (length | tostring) + " threads)\n" +
  ([.[] |
    "  " +
    (if .isResolved then "RESOLVED" elif .isOutdated then "OUTDATED" else "UNRESOLVED" end) +
    " (line " + (if .line then (.line | tostring) elif .startLine then (.startLine | tostring) elif .originalLine then ("~" + (.originalLine | tostring)) elif .originalStartLine then ("~" + (.originalStartLine | tostring)) else "?" end) + ")" +
    (if (.comments.nodes | length) > 1 then " <- has replies" else "" end) +
    "\n" +
    (.comments.nodes | to_entries | map(
      if .key == 0 then
        "    @" + .value.author.login +
        (if .value.originalCommit then " [" + .value.originalCommit.abbreviatedOid + "]" else "" end) +
        ": " + (if (.value.body | length) > $first_limit then (.value.body[:$first_limit] + " [truncated]") else .value.body end)
      else
        "      -> @" + .value.author.login + ": " +
        (if (.value.body | length) > $reply_limit then (.value.body[:$reply_limit] + " [truncated]") else .value.body end)
      end
    ) | join("\n"))
  ] | join("\n\n")) + "\n"
'
