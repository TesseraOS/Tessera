#!/usr/bin/env pwsh
# init.ps1 - Tessera environment bootstrap & health check (Windows-first).
# Runs: tool-presence + version checks -> state validation -> (install + gates if toolchain present).
# Exits non-zero if a required tool is missing or harness state is invalid.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$problems = @()
function Note($ok, $label, $detail) {
  $mark = if ($ok) { 'OK ' } else { 'XX ' }
  Write-Host ("  [{0}] {1} {2}" -f $mark, $label.PadRight(10), $detail)
  if (-not $ok) { $script:problems += $label }
}

Write-Host "`nTessera - environment health" -ForegroundColor Cyan
Write-Host ("repo: {0}" -f $root)

# --- required toolchain ---
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $nodeV = (& node -v).TrimStart('v')
  $want = (Get-Content (Join-Path $root '.nvmrc') -ErrorAction SilentlyContinue | Select-Object -First 1)
  $match = if ($want) { $nodeV -eq $want.Trim() } else { $true }
  Note $true 'node' ("v$nodeV" + $(if ($want -and -not $match) { " (want $($want.Trim()) per .nvmrc)" } else { '' }))
} else { Note $false 'node' 'not found - install Node 22 LTS' }

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpm) {
  $pnpmV = (& pnpm -v)
  Note (([int]($pnpmV.Split('.')[0])) -ge 9) 'pnpm' "v$pnpmV (want >= 9)"
} else { Note $false 'pnpm' 'not found - `corepack enable` or install pnpm >= 9' }

$git = Get-Command git -ErrorAction SilentlyContinue
Note ([bool]$git) 'git' $(if ($git) { (& git --version) } else { 'not found' })

# --- optional toolchain (informational) ---
$docker = Get-Command docker -ErrorAction SilentlyContinue
Write-Host ("  [opt] {0} {1}" -f 'docker'.PadRight(10), $(if ($docker) { (& docker --version) } else { 'not installed (only needed for self-host/cloud parity)' }))
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
Write-Host ("  [opt] {0} {1}" -f 'ollama'.PadRight(10), $(if ($ollama) { (& ollama --version) } else { 'not installed (optional local embedding/LLM runtime)' }))

# --- harness state validation ---
Write-Host "`nValidating harness state..." -ForegroundColor Cyan
if ($node) {
  & node (Join-Path $root 'scripts/verify-state.mjs')
  if ($LASTEXITCODE -ne 0) { $problems += 'state' }
} else {
  Write-Host "  skipped (node missing)"
}

# --- install + verification gates (only once the toolchain lands) ---
if (Test-Path (Join-Path $root 'package.json')) {
  Write-Host "`npackage.json found - installing deps + running gates..." -ForegroundColor Cyan
  & pnpm install
  foreach ($g in @('typecheck', 'lint', 'test', 'build')) {
    Write-Host "  -> pnpm -w $g"
    & pnpm -w $g
    if ($LASTEXITCODE -ne 0) { $problems += "gate:$g" }
  }
} else {
  Write-Host "`nNo package.json yet - workspace scaffold is feature F-001 (.harness/state/feature_list.json)." -ForegroundColor Yellow
}

# --- summary ---
Write-Host ""
if ($problems.Count -eq 0) {
  Write-Host "Health: OK" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("Health: PROBLEMS -> " + ($problems -join ', ')) -ForegroundColor Red
  exit 1
}
