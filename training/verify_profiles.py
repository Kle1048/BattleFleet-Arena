"""Independent full-round evaluation of the final balanced personality exports."""
import argparse

from camp import PPO, evaluate, torch, write_json, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", choices=["aggressive", "cautious", "objective"])
    parser.add_argument("--seed", type=int, default=7_000_000)
    parser.add_argument("--run", help="Run folder name under training/runs")
    parser.add_argument("--episodes", type=int, default=20)
    args = parser.parse_args()
    if args.episodes < 2:
        parser.error("at least two episodes are required for rollout parity")
    torch.set_num_threads(1)
    folder = ROOT / "training/runs" / (args.run or f"personality-{args.profile}-balanced")
    runtime = evaluate(policy_path=str(folder / "policy.json"), episodes=args.episodes, seed=args.seed)
    # Local checkpoints produced by our own training runs are trusted.
    model = PPO.load(folder / "best.zip", device="cpu")
    python = evaluate(model, episodes=2, seed=args.seed)
    if python["rows"] != runtime["rows"][:2]:
        raise AssertionError("Python/runtime full-round outcomes differ")
    runtime["runtime_rollout_parity_episodes"] = 2
    write_json(folder / "independent-evaluation-final.json", runtime)
    print(args.profile, {k: v for k, v in runtime.items() if k != "rows"}, flush=True)


if __name__ == "__main__":
    main()
