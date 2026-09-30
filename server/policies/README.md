# Trained release policies

Data-only PPO exports copied unchanged from the evaluated local training runs:

- `aggressive.json`: `personality-aggressive-balanced`
- `cautious.json`: `personality-cautious-balanced`
- `objective.json`: `personality-objective-balanced-final`

Each export contains its source checkpoint SHA-256, controller version, training
scenario and numerical parity evidence. Training checkpoints and session data
remain excluded from Git. See `training/VERIFICATION.md` for evaluation limits.

From the repository root, activate the mixed roster with the environment value:

```text
BFA_BOT_POLICY_PATHS=["server/policies/objective.json","server/policies/aggressive.json","server/policies/aggressive.json","server/policies/cautious.json"]
```

The roster repeats per room. Set the persisted minimum participants to five for
one human plus four bots. Existing humans replace bots through the usual room
population rules. No Python runtime is needed in production.

`mixed-settings.json` records the tested local round settings for this release.
Apply through ConfigService after backing up production data; it contains no
leaderboard or player data. Preserve the previous configuration for rollback.
