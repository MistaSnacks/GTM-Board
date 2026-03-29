#!/bin/bash
cd /Users/admin/gtm-board

# Allow nested Claude sessions
unset CLAUDECODE

MAX_ITERATIONS=10
ITERATION=0
COMPLETION_PHRASE="RALPH_COMPLETE"
LOG_FILE="ralph_output.log"

echo "Starting Ralph Loop — Architecture Refactor (env scoping, UGC removal, gtm_help, default project)" | tee "$LOG_FILE"
echo "Max iterations: $MAX_ITERATIONS" | tee -a "$LOG_FILE"
echo "---" | tee -a "$LOG_FILE"

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo "" | tee -a "$LOG_FILE"
  echo "=== ITERATION $ITERATION / $MAX_ITERATIONS ===" | tee -a "$LOG_FILE"
  echo "$(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"

  OUTPUT=$(cat PROMPT.md | claude --dangerously-skip-permissions -p 2>&1)
  echo "$OUTPUT" >> "$LOG_FILE"

  if echo "$OUTPUT" | grep -q "$COMPLETION_PHRASE"; then
    echo "" | tee -a "$LOG_FILE"
    echo "RALPH_COMPLETE detected on iteration $ITERATION!" | tee -a "$LOG_FILE"
    exit 0
  fi

  echo "Iteration $ITERATION complete, continuing..." | tee -a "$LOG_FILE"
done

echo "" | tee -a "$LOG_FILE"
echo "Max iterations ($MAX_ITERATIONS) reached." | tee -a "$LOG_FILE"
exit 1
