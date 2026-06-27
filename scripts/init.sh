#!/usr/bin/env bash
# init.sh — Tessera environment bootstrap & health check (POSIX parity with init.ps1).
# Runs: tool-presence + version checks -> state validation -> (install + gates if toolchain present).
# Exits non-zero if a required tool is missing or harness state is invalid.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

problems=()
note() { # note <ok:0|1> <label> <detail>
  local mark; if [ "$1" -eq 1 ]; then mark="OK "; else mark="XX "; problems+=("$2"); fi
  printf '  [%s] %-10s %s\n' "$mark" "$2" "$3"
}

printf '\nTessera — environment health\n'
printf 'repo: %s\n' "$ROOT"

# --- required toolchain ---
if command -v node >/dev/null 2>&1; then
  nodeV="$(node -v | sed 's/^v//')"
  want="$(head -n1 .nvmrc 2>/dev/null | tr -d '[:space:]' || true)"
  extra=""; [ -n "$want" ] && [ "$nodeV" != "$want" ] && extra=" (want $want per .nvmrc)"
  note 1 node "v${nodeV}${extra}"
else
  note 0 node "not found — install Node 22 LTS"
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpmV="$(pnpm -v)"; major="${pnpmV%%.*}"
  if [ "$major" -ge 9 ]; then note 1 pnpm "v${pnpmV} (want >= 9)"; else note 0 pnpm "v${pnpmV} (want >= 9)"; fi
else
  note 0 pnpm "not found — 'corepack enable' or install pnpm >= 9"
fi

if command -v git >/dev/null 2>&1; then note 1 git "$(git --version)"; else note 0 git "not found"; fi

# --- optional toolchain (informational) ---
if command -v docker >/dev/null 2>&1; then printf '  [opt] %-10s %s\n' docker "$(docker --version)"; \
  else printf '  [opt] %-10s %s\n' docker "not installed (only needed for self-host/cloud parity)"; fi
if command -v ollama >/dev/null 2>&1; then printf '  [opt] %-10s %s\n' ollama "$(ollama --version)"; \
  else printf '  [opt] %-10s %s\n' ollama "not installed (optional local embedding/LLM runtime)"; fi

# --- harness state validation ---
printf '\nValidating harness state...\n'
if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/verify-state.mjs" || problems+=("state")
else
  echo "  skipped (node missing)"
fi

# --- install + verification gates (only once the toolchain lands) ---
if [ -f "$ROOT/package.json" ]; then
  printf '\npackage.json found — installing deps + running gates...\n'
  pnpm install
  for g in typecheck lint test build; do
    echo "  -> pnpm -w $g"
    pnpm -w "$g" || problems+=("gate:$g")
  done
else
  printf '\nNo package.json yet — workspace scaffold is feature F-001 (.harness/state/feature_list.json).\n'
fi

# --- summary ---
echo
if [ "${#problems[@]}" -eq 0 ]; then
  echo "Health: OK"; exit 0
else
  echo "Health: PROBLEMS -> ${problems[*]}"; exit 1
fi
