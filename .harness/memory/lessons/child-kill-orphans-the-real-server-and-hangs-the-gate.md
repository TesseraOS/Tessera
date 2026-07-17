---
id: child-kill-orphans-the-real-server-and-hangs-the-gate
kind: lesson
title: child.kill() reaches only the DIRECT child — the orphaned server held our pipes and hung the gate forever, after it printed PASS
links:
  - tests/web-perf/web-perf.mjs
  - .harness/verification/gates.json
  - package.json
confidence: 1
created: 2026-07-17
---

**What happened:** `pnpm test:perf` ran forever — 30 minutes on CI, unbounded locally. The tell was
that it hung **after succeeding**: it printed every measurement and `✓ web-perf gate passed`, then
never exited. The gate logic was fine; the process never died.

`startApp()` spawned `pnpm --filter <app> start --port N` with `shell: true` + `stdio: 'pipe'`, and
`stop()` was `child.kill('SIGTERM')`. **`kill()` signals only the DIRECT child.** With a shell that
child is `cmd.exe`; the tree is `cmd.exe → pnpm → node next start`. Killing the wrapper left the real
server alive — and the orphan still held the **write end of our stdio pipes**, so the read handles
stayed active, the event loop never drained, and Node could not exit. Proven two ways: a leftover
`node …/next/dist/bin/next start --port 3311` was still LISTENING from a run the day before, and a
6-line repro showed **2 live `Socket` handles** 2s after `kill()` returned.

**The second bug hiding behind it:** the orphan owned port 3311. The next run would have connected to
**yesterday's server** and happily measured a stale build — a budget gate reporting fiction, green.

**Fix (tests/web-perf/web-perf.mjs):**

- **Own ONE process.** Spawn `node <next-bin> start` directly from the app's own directory — never
  through `pnpm --filter` or a shell. No wrapper, no tree, nothing to orphan. Resolve the binary with
  `createRequire(<app>/package.json).resolve('next/dist/bin/next')`.
- **Kill the TREE anyway** (belt-and-braces — `next start` may fork workers): `detached: true` on POSIX
  so the child leads its own group, then `process.kill(-pid, …)`; on Windows there is no signalable
  group, so `taskkill /PID <pid> /T /F`. Escalate SIGTERM→SIGKILL on a timer; never wait unbounded.
- **Register teardown process-wide** (`process.on('exit'|'SIGINT'|'SIGTERM')`, synchronous), not in a
  `finally` — a crash must not leak a server that poisons the next run.
- **Drain the pipes.** An unread pipe fills its buffer and wedges the process writing to it. Keep the
  tail so a boot failure reports what the app actually said.
- **Preflight the port** (`net.createServer().listen()` → EADDRINUSE) and fail loudly. Measuring an
  impostor is worse than not measuring.
- **Race the wait loop against child exit.** "Not built" went from 120s of silence + "has the app been
  built?" to an instant, specific error carrying the server's own output.

**How to apply:**

- **A hang right after a success message is an open-handle bug, not a logic bug.** Reach for
  `process._getActiveHandles()` before re-reading the algorithm.
- **Never signal through a wrapper.** If a test must own a server, spawn the real binary directly. Any
  shell/`pnpm`/`npx` layer between you and the process makes `kill()` a lie. Playwright's `webServer`
  (used by apps/web, apps/marketing, tests/e2e-full) already solves this — **web-perf was the one place
  hand-rolling it, and the one place that broke.** Prefer the repo's existing pattern.
- **Leaked listeners outlive the run.** When a port-bound test misbehaves, check for orphans
  (`netstat -ano` + `Get-CimInstance Win32_Process | select CommandLine`) before trusting any number
  it produced.
- **`turbo run <task>` unfiltered gives EVERY package a task node** — including packages with no such
  script — and each node's `^build` rebuilds the monorepo. `test:perf` was building all 16 packages
  while building **neither app it measures**. `--filter=@tessera/web-perf` fixed it; the ordered gate
  list (build is gate 5, web-perf gate 8) is what guarantees the apps exist.

See [[engineering-standards]], [[turbo-cache-stale-uncommitted]], [[a-gate-that-errors-is-failing-open]].
