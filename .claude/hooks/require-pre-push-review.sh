#!/usr/bin/env bash
# PreToolUse(Bash): before Claude runs `git push`, require the pre-push-review
# skill to have reviewed the current HEAD. Review findings are warnings only;
# this hook only makes sure the review happened.
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)' || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
head=$(git rev-parse HEAD 2>/dev/null) || exit 0
marker=$(git rev-parse --git-path claude-pre-push-reviewed)

if [ -f "$marker" ] && [ "$(cat "$marker")" = "$head" ]; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "Run the pre-push-review skill first: review the unpushed commits as a senior Angular developer, show the optimization warnings to the user, record the marker, then retry the push. Warnings do not block the push."
  }
}'
