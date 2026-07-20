---
id: powershell-51-round-trips-mojibake-utf8-content
kind: lesson
title: Never bulk-edit UTF-8 content files through PowerShell 5.1 Get-Content/Set-Content — the ANSI read + UTF-8 write round-trip mojibakes every non-ASCII character
links:
  - apps/docs/content/docs/agents/
confidence: 0.95
created: 2026-07-20
---

**What happened:** A bulk find-and-replace over five MDX files
(`Get-Content -Raw | -replace ... | Set-Content -Encoding utf8`) corrupted every
em-dash and arrow into mojibake (`—` → `â€”`). PowerShell 5.1's `Get-Content` without
`-Encoding` reads BOM-less UTF-8 as the ANSI codepage (each UTF-8 byte becomes its own
wrong character), and writing that misreading back **as** UTF-8 bakes the corruption
in. The replace pattern also silently failed to match (the pattern held the real
em-dash, the misread content held mojibake), so the files were corrupted *without even
performing the intended edit*. Recovery was `git checkout --` (the files were
committed) + redoing the change with the Edit tool per file.

**The rule:** prose/content files with non-ASCII (em-dashes, arrows, typographic
punctuation — i.e. all of this repo's docs) are edited with the Edit/Write tools, never
piped through PS 5.1 cmdlets. If a shell bulk edit is truly needed, it must pass
`-Encoding utf8` on the READ side too — but per-file Edit-tool changes are the safe
default, and committed state before any bulk operation is the cheap insurance that made
this a two-minute recovery instead of a rewrite.
