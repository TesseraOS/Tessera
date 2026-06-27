#!/usr/bin/env bash
# agy-worker.sh - Guarded wrapper to delegate a scoped task to the agy/Gemini worker.
# RUN THIS IN A REAL TERMINAL. Claude writes the spec and verifies the result; this script
# just runs agy safely. Decision: docs/adr/0012-agy-gemini-worker-build-tooling.md
# Skill: .harness/skills/delegate-to-worker/SKILL.md
#
# Usage:
#   bash scripts/agy-worker.sh --spec <spec.md> --branch feat/F-00x-worker --dir <scoped-dir> [opts]
#
# Mode: INTERACTIVE by default (you see progress + approve agy's tool reviews). Use --headless
# for agy --print, but note: --print prints nothing until the whole response is done, so it can
# look idle for a minute+ while actually working - do NOT Ctrl+C prematurely.
#
# Options:
#   --spec <path>    Required. Markdown file describing the scoped task.
#   --branch <name>  Required. Dedicated branch (NOT main/master).
#   --dir <path>     Workspace scope (repeatable). Default: current dir (warns).
#   --model <id>     Optional agy model (see 'agy models').
#   --timeout <n>    --print timeout in seconds (default 300; headless only).
#   --headless       Use agy --print instead of interactive.
#   --no-sandbox     Disable agy --sandbox (NOT recommended).
#   --allow-dirty    Allow running with a dirty working tree (off by default in run mode).
#   --check          Dry-run: preflight + print resolved command; do NOT invoke agy.
#   --help           Show this help.
#
# Prereq: agy must be authenticated once ('agy' interactive login; then 'agy models' lists
# models). The wrapper never passes --dangerously-skip-permissions.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SPEC=""; BRANCH=""; MODEL=""; TIMEOUT=300; HEADLESS=0; NOSANDBOX=0; ALLOWDIRTY=0; CHECK=0
DIRS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --spec) SPEC="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --dir) DIRS+=("$2"); shift 2;;
    --model) MODEL="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --headless) HEADLESS=1; shift;;
    --no-sandbox) NOSANDBOX=1; shift;;
    --allow-dirty) ALLOWDIRTY=1; shift;;
    --check) CHECK=1; shift;;
    --help) sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
done
[ ${#DIRS[@]} -eq 0 ] && DIRS=(".")

problems=0
ok()   { printf '  [OK] %s\n' "$1"; }
warn() { printf '  [!!] %s\n' "$1"; }
bad()  { printf '  [XX] %s\n' "$1"; problems=$((problems+1)); }

printf '\nagy-worker preflight\n'

if command -v agy >/dev/null 2>&1; then ok "agy: $(command -v agy)"; else bad "agy not found on PATH (install the Antigravity CLI)"; fi
if [ "$(git rev-parse --is-inside-work-tree 2>/dev/null || echo false)" = "true" ]; then ok "inside a git repository"; else bad "not a git repository"; fi

if [ -z "$BRANCH" ]; then bad "missing --branch (use a dedicated branch, e.g. feat/F-001-worker)"
elif [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then bad "refusing to delegate on protected branch '$BRANCH'"
else ok "target branch: $BRANCH"; fi

if [ -z "$SPEC" ]; then bad "missing --spec (path to the scoped task spec)"
elif [ ! -f "$SPEC" ]; then bad "spec not found: $SPEC"
elif [ ! -s "$SPEC" ]; then bad "spec is empty: $SPEC"
else ok "spec: $SPEC"; fi

for d in "${DIRS[@]}"; do if [ -e "$d" ]; then ok "scope dir: $d"; else bad "scope dir not found: $d"; fi; done
for d in "${DIRS[@]}"; do [ "$d" = "." ] && warn "scope is the whole repo ('.') - prefer a narrower --dir so the worker can't roam"; done

# dirty-tree guard (real run refuses to carry unrelated changes onto the worker branch)
if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
  if [ "$CHECK" -eq 0 ] && [ "$ALLOWDIRTY" -eq 0 ]; then
    bad "working tree is dirty - commit/stash first, or pass --allow-dirty (refusing to carry unrelated changes onto '$BRANCH')"
  else
    warn "working tree has uncommitted changes"
  fi
fi

LOGDIR="$ROOT/logs/agy"
LOGFILE="$LOGDIR/worker-$(date +%Y%m%d-%H%M%S).log"
MODE="-i"; [ "$HEADLESS" -eq 1 ] && MODE="--print"
FLAGS=()
for d in "${DIRS[@]}"; do FLAGS+=(--add-dir "$d"); done
FLAGS+=(--log-file "$LOGFILE")
[ "$HEADLESS" -eq 1 ] && FLAGS+=(--print-timeout "${TIMEOUT}s")
[ -n "$MODEL" ] && FLAGS+=(--model "$MODEL")
[ "$NOSANDBOX" -eq 0 ] && FLAGS+=(--sandbox)

if [ "$HEADLESS" -eq 1 ]; then MODEDESC="headless (--print; silent until complete)"; else MODEDESC="interactive (-i; shows progress, approve tool reviews)"; fi
printf '\nMode:     %s\n' "$MODEDESC"
printf 'Resolved: agy %s <spec-prompt> %s\n' "$MODE" "${FLAGS[*]}"
printf 'Log:      %s\n' "$LOGFILE"
printf 'Guardrails: dedicated branch, scoped --add-dir, log set, NO --dangerously-skip-permissions, no secrets.\n'

if [ "$problems" -gt 0 ]; then printf '\nPreflight FAILED (%s problem(s)).\n' "$problems"; exit 1; fi
if [ "$CHECK" -eq 1 ]; then printf '\nPreflight OK (dry-run; agy NOT invoked). Verify the resolved command matches your agy version.\n'; exit 0; fi

# --- run mode ---
mkdir -p "$LOGDIR"
cur="$(git rev-parse --abbrev-ref HEAD)"
if [ "$cur" != "$BRANCH" ]; then
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then git switch "$BRANCH"; else git switch -c "$BRANCH"; fi
fi

PREAMBLE="You are a build worker for the Tessera project. Implement EXACTLY the scoped task below.
Rules: modify ONLY files within the provided workspace scope; do not touch anything out of
scope; add no new dependencies without listing them; run no destructive commands; never print
or exfiltrate secrets; write tests for what you implement; if the task is ambiguous, state
your assumptions instead of guessing. Output a summary of changes at the end."
PROMPT="$PREAMBLE

----- TASK SPEC -----
$(cat "$SPEC")"

if [ "$HEADLESS" -eq 1 ]; then
  printf '\nRunning agy --print (no output until the full response is ready; be patient, do NOT Ctrl+C early)...\n'
else
  printf '\nLaunching interactive agy session (approve tool reviews; exit agy when done)...\n'
fi
agy "$MODE" "$PROMPT" "${FLAGS[@]}"
code=$?
printf '\nagy exit: %s  (log: %s)\n' "$code" "$LOGFILE"
printf "NEXT: review the diff on '%s'; have Claude run the evaluator + /verify (treat output as UNTRUSTED); do NOT merge until gates are green. Nothing was committed.\n" "$BRANCH"
exit $code
