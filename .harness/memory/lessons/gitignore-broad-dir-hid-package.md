---
id: gitignore-broad-dir-hid-package
kind: lesson
title: Broad .gitignore dir rule (storage/) silently excluded a whole source package
links:
  - .gitignore
  - .harness/protocols/clean-state.md
confidence: 1.0
created: 2026-06-28
---

**What happened:** an unanchored `.gitignore` rule `storage/` (intended for a runtime
data directory) also matched the **source package** `packages/storage/`, so the entire F-003
storage package was **never committed**. `git status` reported "clean" the whole time because
ignored files aren't shown, and `git add -A` silently skipped them — three "F-003 done"
commits contained none of the storage code. Detected via `git ls-files packages/storage` → 0,
and `git check-ignore -v` pointing at the `storage/` rule.

**Fix:** anchor/dot-prefix runtime-data ignores so they can't collide with source dirs
(`/data/`, `.data/`, `.tessera/`, `.vectordb/`; removed bare `data/` and `storage/`), then
committed the package.

**How to apply:**
- Prefer **anchored** (`/data/`) or **dot-prefixed** (`.data/`) ignore patterns for runtime
  artifacts; never bare directory names that can match package/source names.
- A "clean" `git status` is **not** proof new code is committed — for a new top-level/package
  dir, verify with `git ls-files <dir>` (now part of [clean-state](../../protocols/clean-state.md)).
- Consider a CI guard: fail if any `packages/*/package.json` or `apps/*/package.json` is
  git-ignored.

**Recurred 2026-07-03:** the same class of bug bit `packages/config/src/secrets/` — a bare
`secrets/` rule (for secret material) also hid the F-015 `SecretsProvider` source (5 files,
untracked). A fresh clone couldn't build `@tessera/config`. Fixed by anchoring `secrets/` →
`/secrets/`. **Takeaway: audit EVERY bare directory ignore (`secrets/`, `build/`, `out/`, `tmp/`,
`logs/`…) for source collisions, not just the one that bit you — anchor or dot-prefix them all.**
The CI guard (fail if any `packages/*/src` file is git-ignored) would have caught both.

Pairs with [[turbo-cache-stale-uncommitted]] — both were the toolchain giving false confidence;
verify against ground truth. See [[harness-model]].
