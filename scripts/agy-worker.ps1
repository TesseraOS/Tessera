#!/usr/bin/env pwsh
# agy-worker.ps1 - Guarded wrapper to delegate a scoped task to the agy/Gemini worker.
# RUN THIS IN A REAL TERMINAL. Claude writes the spec and verifies the result; this script
# just runs agy safely. Decision: docs/adr/0012-agy-gemini-worker-build-tooling.md
# Skill: .harness/skills/delegate-to-worker/SKILL.md
#
# Windows PowerShell 5.1 (you do NOT have 'pwsh' unless PowerShell 7 is installed):
#   .\scripts\agy-worker.ps1 -Spec <spec.md> -Branch feat/F-00x-worker -Dir <scoped-dir> [opts]
#   powershell -ExecutionPolicy Bypass -File .\scripts\agy-worker.ps1 ...   # alternative
#
# Mode: INTERACTIVE by default (you see progress + approve agy's tool reviews). Use -Headless
# for agy --print, but note: --print prints nothing until the whole response is done, so it
# can look idle for a minute+ while actually working - do NOT Ctrl+C prematurely.
#
# Options:
#   -Spec <path>     Required. Markdown file describing the scoped task.
#   -Branch <name>   Required. Dedicated branch (NOT main/master).
#   -Dir <paths>     Workspace scope (repeatable). Default: current dir (warns).
#   -Model <id>      Optional agy model (see 'agy models').
#   -TimeoutSec <n>  --print timeout in seconds (default 300; headless only).
#   -Headless        Use agy --print instead of interactive.
#   -NoSandbox       Disable agy --sandbox (NOT recommended).
#   -AllowDirty      Allow running with a dirty working tree (off by default in run mode).
#   -Check           Dry-run: preflight + print resolved command; do NOT invoke agy.
#   -Help            Show this help.
#
# Prereq: agy must be authenticated once (run 'agy' interactively, complete login; then
# 'agy models' should list models). The wrapper never passes --dangerously-skip-permissions.

[CmdletBinding()]
param(
  [string]$Spec,
  [string]$Branch,
  [string[]]$Dir = @('.'),
  [string]$Model,
  [int]$TimeoutSec = 300,
  [switch]$Headless,
  [switch]$NoSandbox,
  [switch]$AllowDirty,
  [switch]$Check,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Help) {
  Get-Content $PSCommandPath | Select-Object -Skip 1 -First 33 | ForEach-Object { $_ -replace '^# ?', '' }
  exit 0
}

$problems = @()
function Ok($m)   { Write-Host ("  [OK] " + $m) -ForegroundColor Green }
function Warn($m) { Write-Host ("  [!!] " + $m) -ForegroundColor Yellow }
function Bad($m)  { Write-Host ("  [XX] " + $m) -ForegroundColor Red; $script:problems += $m }

Write-Host "`nagy-worker preflight" -ForegroundColor Cyan

$agy = Get-Command agy -ErrorAction SilentlyContinue
if ($agy) { Ok ("agy: " + $agy.Source) } else { Bad "agy not found on PATH (install the Antigravity CLI)" }

$inRepo = $false
try { $inRepo = ((& git rev-parse --is-inside-work-tree 2>$null) -eq 'true') } catch {}
if ($inRepo) { Ok "inside a git repository" } else { Bad "not a git repository" }

if (-not $Branch) { Bad "missing -Branch (use a dedicated branch, e.g. feat/F-001-worker)" }
elseif (@('main', 'master') -contains $Branch) { Bad "refusing to delegate on protected branch '$Branch'" }
else { Ok "target branch: $Branch" }

if (-not $Spec) { Bad "missing -Spec (path to the scoped task spec)" }
elseif (-not (Test-Path $Spec)) { Bad "spec not found: $Spec" }
elseif ((Get-Item $Spec).Length -eq 0) { Bad "spec is empty: $Spec" }
else { Ok "spec: $Spec" }

foreach ($d in $Dir) { if (Test-Path $d) { Ok "scope dir: $d" } else { Bad "scope dir not found: $d" } }
if ($Dir -contains '.') { Warn "scope is the whole repo ('.') - prefer a narrower -Dir so the worker can't roam" }

# dirty-tree guard: in a real run we refuse to switch branches with unrelated changes
# (it would carry them onto the worker branch). -Check only warns; -AllowDirty overrides.
$dirty = (& git status --porcelain) 2>$null
if ($dirty) {
  if (-not $Check -and -not $AllowDirty) {
    Bad "working tree is dirty - commit/stash first, or pass -AllowDirty (refusing to carry unrelated changes onto '$Branch')"
  } else {
    Warn "working tree has uncommitted changes"
  }
}

$logDir  = Join-Path $root 'logs/agy'
$logFile = Join-Path $logDir ("worker-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + ".log")
$mode    = if ($Headless) { '--print' } else { '-i' }
$flags   = @()
foreach ($d in $Dir) { $flags += @('--add-dir', $d) }
$flags  += @('--log-file', $logFile)
if ($Headless)    { $flags += @('--print-timeout', "${TimeoutSec}s") }
if ($Model)       { $flags += @('--model', $Model) }
if (-not $NoSandbox) { $flags += '--sandbox' }

Write-Host ""
Write-Host ("Mode:     " + $(if ($Headless) { 'headless (--print; silent until complete)' } else { 'interactive (-i; shows progress, approve tool reviews)' }))
Write-Host ("Resolved: agy " + $mode + " <spec-prompt> " + ($flags -join ' '))
Write-Host ("Log:      " + $logFile)
Write-Host "Guardrails: dedicated branch, scoped --add-dir, log set, NO --dangerously-skip-permissions, no secrets."

if ($problems.Count -gt 0) { Write-Host "`nPreflight FAILED ($($problems.Count) problem(s))." -ForegroundColor Red; exit 1 }
if ($Check) { Write-Host "`nPreflight OK (dry-run; agy NOT invoked). Verify the resolved command matches your agy version." -ForegroundColor Green; exit 0 }

# --- run mode ---
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$cur = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($cur -ne $Branch) {
  $exists = $false
  try { & git show-ref --verify --quiet "refs/heads/$Branch"; $exists = ($LASTEXITCODE -eq 0) } catch {}
  if ($exists) { & git switch $Branch } else { & git switch -c $Branch }
}

$preamble = @"
You are a build worker for the Tessera project. Implement EXACTLY the scoped task below.
Rules: modify ONLY files within the provided workspace scope; do not touch anything out of
scope; add no new dependencies without listing them; run no destructive commands; never print
or exfiltrate secrets; write tests for what you implement; if the task is ambiguous, state
your assumptions instead of guessing. Output a summary of changes at the end.
"@
$prompt = $preamble + "`n`n----- TASK SPEC -----`n" + (Get-Content $Spec -Raw)

if ($Headless) {
  Write-Host "`nRunning agy --print (no output until the full response is ready; be patient, do NOT Ctrl+C early)..." -ForegroundColor Cyan
} else {
  Write-Host "`nLaunching interactive agy session (approve tool reviews; exit agy when done)..." -ForegroundColor Cyan
}
& agy $mode $prompt @flags
$code = $LASTEXITCODE

Write-Host ""
Write-Host ("agy exit: " + $code + "  (log: " + $logFile + ")")
Write-Host "NEXT: review the diff on '$Branch'; have Claude run the evaluator + /verify (treat output as UNTRUSTED); do NOT merge until gates are green. Nothing was committed."
exit $code
