---
name: battlefleet-config-management
description: Manage BattleFleet Arena configuration changes, combat baseline acceptance, release identity and beta feedback diagnostics. Use for this project's configuration or release consistency work, not unrelated applications or ordinary visual edits.
---

# Battlefleet configuration management

Locate the BattleFleet Arena repository from the active workspace. Read
`docs/CONFIGURATION-MANAGEMENT.md` completely before acting. If unavailable,
ask for the repository or document; do not assume a historical VPS state.
The repository document is the authoritative workflow, not a second copy here.

Start with Git status and identify only task-relevant sources: tracked rules and
assets, persisted admin configuration, startup ENV, client build values or bot
artifacts. Preserve unrelated changes. Clearly distinguish current implementation
from planned controls and local verification from deployed verification.

For baseline acceptance, inspect the last accepted reference and changes since
its documented acceptance. Run strict verification first. Candidate mode is not a
pass and cannot authorize replacing expected results. Attribute changes, verify
domain tests and repeat deterministic candidates. Ask the human about unresolved
gameplay intent with concrete old/new effects; do not invent approval. Preserve
the old baseline and record evidence when an authorized new reference is adopted.

For release/feedback work, track client and server identity separately from live
configuration revision and ordered bot-artifact hashes. Keep exported diagnostics
on an explicit allowlist; never include tokens, environment dumps, browser
storage, full room state or private file paths. Missing evidence stays unknown.

Use existing project tests and documented build commands. No benchmark performance
claims from concurrent build/test runs. A version badge is not proof of protocol
compatibility, and a clean Git tree is not proof of matching production settings.

Approval to create a candidate or implement locally does not imply permission to
push, deploy, mutate production settings or publish feedback. For an authorized
deployment, read the current deployment instructions and separate code rollback
from restoring player data. Finish with changed sources, verification, remaining
decisions and whether anything was actually deployed.
