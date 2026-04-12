#!/bin/bash
# pr-comment.sh - Queue an inline review comment for later submission
#
# Usage:
#   pr-comment.sh <file> <line> --severity <level> --title "desc" --why "reason" <<'EOF'
#   suggestion code here
#   EOF
#
#   pr-comment.sh <file> <line> --severity <level> --title "desc" --why "reason" --no-suggestion
#
# Severity levels: critical, high, medium, low, nitpick
#
# Environment variables:
#   PR_REVIEW_REPO          - Repository (owner/repo)
#   PR_REVIEW_PR_NUMBER     - Pull request number
#   PR_REVIEW_COMMENTS_DIR  - Directory for queued comments (default: /tmp/pr-review-comments)

set -e

REPO="${PR_REVIEW_REPO:?PR_REVIEW_REPO environment variable is required}"
PR_NUMBER="${PR_REVIEW_PR_NUMBER:?PR_REVIEW_PR_NUMBER environment variable is required}"
COMMENTS_DIR="${PR_REVIEW_COMMENTS_DIR:-/tmp/pr-review-comments}"

FILE="$1"
LINE="$2"
shift 2 2>/dev/null || true

if [ -z "$FILE" ] || [ -z "$LINE" ]; then
  echo "Usage: pr-comment.sh <file> <line> --severity <level> --title \"desc\" --why \"reason\" [<<'EOF' ... EOF]"
  exit 1
fi

if ! [[ "$LINE" =~ ^[1-9][0-9]*$ ]]; then
  echo "Error: Line number must be a positive integer (>= 1), got: $LINE"
  exit 1
fi

SEVERITY=""
TITLE=""
WHY=""
NO_SUGGESTION=false

while [ $# -gt 0 ]; do
  case "$1" in
    --severity) SEVERITY="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --why) WHY="$2"; shift 2 ;;
    --no-suggestion) NO_SUGGESTION=true; shift ;;
    *) shift ;;
  esac
done

if [ -z "$SEVERITY" ] || [ -z "$TITLE" ] || [ -z "$WHY" ]; then
  echo "Error: --severity, --title, and --why are all required"
  exit 1
fi

declare -A SEVERITY_EMOJI=(
  [critical]="CRITICAL"
  [high]="HIGH"
  [medium]="MEDIUM"
  [low]="LOW"
  [nitpick]="NITPICK"
)

if [ -z "${SEVERITY_EMOJI[$SEVERITY]+x}" ]; then
  echo "Error: Invalid severity '${SEVERITY}'. Must be: critical, high, medium, low, nitpick"
  exit 1
fi

SUGGESTION=""
if [ "$NO_SUGGESTION" = false ] && [ ! -t 0 ]; then
  SUGGESTION=$(cat)
fi

DIFF_DATA=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}/files" --paginate | jq --arg f "$FILE" '.[] | select(.filename==$f)')

if [ -z "$DIFF_DATA" ]; then
  echo "Error: File '${FILE}' not found in PR diff"
  echo ""
  echo "Files changed in this PR:"
  gh api "repos/${REPO}/pulls/${PR_NUMBER}/files" --paginate --jq '.[].filename'
  exit 1
fi

PATCH=$(echo "$DIFF_DATA" | jq -r '.patch // empty')

if [ -z "$PATCH" ]; then
  echo "Error: No patch data for file '${FILE}' (file may be binary or too large)"
  exit 1
fi

LINE_IN_DIFF=$(echo "$PATCH" | awk -v target_line="$LINE" '
BEGIN { current_line = 0; found = 0 }
/^@@/ {
  line = $0
  gsub(/.*\+/, "", line)
  gsub(/[^0-9].*/, "", line)
  current_line = line - 1
  next
}
{
  if (substr($0, 1, 1) != "-") {
    current_line++
    if (current_line == target_line) {
      found = 1
      exit
    }
  }
}
END { if (found) print "1"; else print "0" }
')

if [ "$LINE_IN_DIFF" != "1" ]; then
  echo "Error: Line ${LINE} not found in the diff for '${FILE}'"
  echo "Note: You can only comment on lines that appear in the diff"
  exit 1
fi

mkdir -p "${COMMENTS_DIR}"

SEVERITY_LABEL="${SEVERITY_EMOJI[$SEVERITY]}"

BODY="**${SEVERITY_LABEL}** ${TITLE}

Why: ${WHY}"

if [ -n "$SUGGESTION" ]; then
  BODY="${BODY}

\`\`\`suggestion
${SUGGESTION}
\`\`\`"
fi

FOOTER='

---
mister-meow | Type `@mister-meow` to interact further'

BODY_WITH_FOOTER="${BODY}${FOOTER}"

COMMENT_ID="comment-$(date +%s)-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')"
COMMENT_FILE="${COMMENTS_DIR}/${COMMENT_ID}.json"

jq -n \
  --arg path "$FILE" \
  --argjson line "$LINE" \
  --arg side "RIGHT" \
  --arg body "$BODY_WITH_FOOTER" \
  --arg id "$COMMENT_ID" \
  '{
    path: $path,
    line: $line,
    side: $side,
    body: $body,
    _meta: {
      id: $id,
      file: $path,
      line: $line
    }
  }' > "${COMMENT_FILE}"

echo "Queued review comment for ${FILE}:${LINE}"
echo "  Severity: ${SEVERITY_LABEL}"
echo "  Title: ${TITLE}"
echo "  Comment ID: ${COMMENT_ID}"
echo "  Submit with: pr-review.sh"
echo "  Remove with: pr-remove-comment.sh ${FILE} ${LINE}"
