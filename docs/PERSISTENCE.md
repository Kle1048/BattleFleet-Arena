# Asynchronous single-process JSON persistence

## Boundaries and ordering

`application/storageServices` constructs one ConfigService and MatchResultService
and one repository/queue per data set for the process. Startup asynchronously loads
both stores before HTTP or matchmaking listens. Invalid data fails startup; it is
never silently replaced with defaults. The simulation reads immutable committed
configuration and hands detached result DTOs to its host. No filesystem, Promise
wait or gameplay RNG draw was added to a simulation step.

Config patches are applied inside the FIFO to its latest confirmed state. Only a
successful save updates the cache. Match aggregation, persistent match-ID markers
and leaderboard reset share another FIFO. Retries retain their position; resets
cannot overtake them. Results submitted after a reset count again. Reset retains
already committed match-ID markers, so retrying an old match cannot resurrect it.
An interrupted round does not produce a result. Each started/restarted round gets
a host-generated `randomUUID`, owned by MatchSystem but not sent over the wire.

## HTTP and failures

The authenticated admin status exposes `configRevision`, `leaderboard.revision`
and bounded storage diagnostics. Config PATCH and leaderboard reset require a
nonnegative integer `expectedRevision` from that status: missing/invalid is 428,
a concurrent change is 409, a storage failure is 503. Success is sent only after
commit. The built-in admin UI supplies revisions and offers Refresh status.
This is an intentional admin API contract change; custom admin clients must adapt.
Game protocol and public leaderboard field projection are unchanged.

A client disconnect/timeout does **not** cancel a write. Refresh status before
retrying; the same old revision cannot overwrite later state. Server logs/metrics
show failure codes; public responses do not contain paths, internal player keys,
native filesystem messages or credentials. Player tokens remain client-chosen
correlation keys, not secure accounts.

Queues accept at most 128 operations including the in-flight operation. Match
service statuses expose Pending/Committed/Failed, retain at most 128 terminal
records and no full player DTOs. Overflow is a rejected Promise and logged by the
room, not silently dropped. Match I/O failures get at most three attempts with
100/200-ms backoff; validation/capacity errors are not retried. Config/reset require
explicit caller retry because their outcome/revision must be rechecked.

## Durability and limits

Each commit writes an exclusively created UUID temp file **in the same directory**,
awaits write + file `sync` + close, then renames over the primary. The previous
acknowledged document is atomically written to `.bak` before replacement. The
commit contract is file-sync plus atomic rename/visibility. Directory sync is
attempted and its support reported; Windows can reject directory handles. No
unqualified power-loss guarantee is made, especially on Windows/network filesystems.
Directory-sync failure after rename cannot be represented as rollback: the commit
is visible and acknowledged with degraded durability diagnostics.

Pending results exist only in RAM. A crash/hard kill before commit can lose them;
there is no durable outbox. Shutdown first stops ingress/rooms, then closes queues
with a five-second flush deadline and a ten-second overall process deadline.
Timeout is logged and exits unsuccessfully; it does not claim pending data was saved.

All filesystem calls are asynchronous. JSON parsing, validation, serialization and
aggregation remain CPU work on the event loop. Each primary/backup document is
limited to 16 MiB; bytes, latest serialization/commit time, queue state and orphan
count are diagnostic fields. Persistent deduplication retains **all** committed IDs
including across resets, within that bounded document limit. IDs are never silently
expired: reaching the limit rejects writes and requires an explicit archival/backend
decision. This prevents unbounded retention without a hidden deduplication window.
Do not interpret this limit as a latency target or production capacity guarantee.

This backend is for **one process and local storage** only. Multiple writers/hosts,
manual live-file edits and live restore are unsupported. SQLite with an asynchronous
worker boundary is the next option when document size, serialization time or write
latency warrants it; no database migration is required merely for this refactor.

## Migration, backup and restore

Legacy config (unversioned object, partial fields allowed) becomes
`{ version: 1, revision, config }`. Leaderboard v1 becomes
`{ version: 2, revision, rows, recordedMatches }`, preserving its rows. Existing
legacy results have no IDs and cannot retroactively be deduplicated. Before migration
the exact legacy bytes are synced to `.migration.bak`; an incompatible existing
migration backup blocks migration instead of overwriting it.

A malformed primary, unknown version, invalid fields or missing primary alongside
backup/temp material blocks startup. A valid primary wins over incomplete orphan
temps; temps are counted and left for operator inspection, never auto-promoted.
Failed normal writes attempt to remove only their own temporary file. Keep external,
versioned backups too: `.bak` is one rollback point, not a backup history.

To recover, **stop all server processes first**, copy the whole data directory to
an independent backup and inspect the desired recovery point. Run from the repo:

```text
node --conditions=bfa-source --import tsx scripts/restore-storage.mjs <absolute-data-dir> config migration RESTORE
node --conditions=bfa-source --import tsx scripts/restore-storage.mjs <absolute-data-dir> leaderboard previous RESTORE
```

Choose `config|leaderboard` and `previous|migration` deliberately. The tool validates
the backup, preserves any current primary as `.before-restore.<uuid>.bak`, then
atomically restores the selected bytes. Restart validates/migrates them again.
Restoring leaderboard also restores its deduplication point; results committed
after that backup can be lost. A code revert alone cannot undo format migration.

Tests exercise FIFO races, stale revisions, event-loop progress under delayed I/O,
write/sync/rename/read failures, bounded retry/overflow/flush, restart deduplication,
reset ordering, migrations and actual restore/reload on temporary copies. They do
not simulate a physical power failure or establish filesystem-specific guarantees.
