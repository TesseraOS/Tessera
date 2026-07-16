# Quernstone ledger — design decisions

Fixture document (F-048). Prose with the same distinctive vocabulary as the fixture source, so a
semantic/keyword search can retrieve it and the compiler can cite it.

## Decision: the quernstone ledger is append-only

We never mutate a recorded quernstone entry. Corrections append a compensating entry instead, so the
ledger's history is always reconstructable and an audit can replay exactly what happened.

**Rationale:** an in-place edit destroys the evidence that the original value ever existed, which is
precisely the thing an audit needs. Appending costs storage; losing history costs trust.

## Decision: totals are computed, never stored

`totalQuernstone` folds the ledger on read rather than maintaining a stored running total. A stored
total is a second source of truth that can silently drift from the entries it summarizes.
