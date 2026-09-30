"""Train, evaluate and export BattleFleet tactical policies. Run --help for commands."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import time

import numpy as np
import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.env_checker import check_env
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from environment import BattleFleetEnv, ROOT

RUNS = ROOT / "training/runs"


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def versions():
    return {name: importlib.metadata.version(name) for name in
            ["torch", "stable-baselines3", "gymnasium", "numpy", "tensorboard"]}


def evaluate(model=None, *, episodes=8, seed=1_000_000, policy_path=None):
    env = BattleFleetEnv(policy_path)
    rows = []
    started = time.perf_counter()
    try:
        for index in range(episodes):
            observation, _ = env.reset(seed=seed + index)
            reward_sum, steps = 0.0, 0
            while True:
                if model is not None:
                    action, _ = model.predict(observation, deterministic=True)
                    result = env.step(int(action))
                elif policy_path:
                    result = env.step(0)  # Runtime model owns decisions inside the worker.
                else:
                    result = env.rule_step()
                observation, reward, terminated, truncated, info = result
                reward_sum += reward
                steps += 1
                if terminated or truncated:
                    rows.append({"seed": seed + index, "reward": reward_sum, "steps": steps, **info})
                    break
    finally:
        env.close()
    return {
        "episodes": episodes,
        "wins": sum(row["outcome"] == "win" for row in rows),
        "losses": sum(row["outcome"] == "loss" for row in rows),
        "draws": sum(row["outcome"] == "draw" for row in rows),
        "win_rate": sum(row["outcome"] == "win" for row in rows) / episodes,
        "mean_reward": float(np.mean([row["reward"] for row in rows])),
        "mean_collisions": float(np.mean([row["collisions"] for row in rows])),
        "wall_seconds": time.perf_counter() - started, "rows": rows,
    }


class ValidationCallback(BaseCallback):
    def __init__(self, output, every, episodes):
        super().__init__()
        self.output, self.every, self.episodes = output, every, episodes
        self.next_evaluation = every
        self.best = None

    def _on_step(self):
        if self.num_timesteps < self.next_evaluation:
            return True
        self.next_evaluation += self.every
        report = evaluate(self.model, episodes=self.episodes, seed=500_000)
        report["timesteps"] = self.num_timesteps
        score = (report["win_rate"], report["mean_reward"])
        self.model.save(self.output / f"checkpoint-{self.num_timesteps}")
        if self.best is None or score > self.best:
            self.best = score
            self.model.save(self.output / "best")
        write_json(self.output / f"validation-{self.num_timesteps}.json", report)
        for key in ["win_rate", "mean_reward", "mean_collisions"]:
            self.logger.record(f"validation/{key}", report[key])
        print(f"Validation at {self.num_timesteps}: {report['wins']} wins, "
              f"{report['losses']} losses, {report['draws']} draws", flush=True)
        return True


def make_env():
    return Monitor(BattleFleetEnv())


def new_model(env, seed=42, rollout=512):
    return PPO("MlpPolicy", env, device="cpu", seed=seed, verbose=1,
               n_steps=rollout, batch_size=128, n_epochs=10,
               learning_rate=3e-4, gamma=0.995, gae_lambda=0.95,
               clip_range=0.2, ent_coef=0.01, vf_coef=0.5,
               max_grad_norm=0.5, target_kl=0.03,
               policy_kwargs={"net_arch": {"pi": [64, 64], "vf": [64, 64]},
                              "activation_fn": torch.nn.Tanh})


def export_policy(model_path, output):
    # SB3 checkpoints may contain pickled Python objects: only load your own trusted files.
    model_path = Path(model_path).resolve()
    model = PPO.load(model_path, device="cpu")
    model.policy.set_training_mode(False)
    env = BattleFleetEnv()
    try:
        spec = env.specification
        layers = [module for module in model.policy.mlp_extractor.policy_net if isinstance(module, torch.nn.Linear)]
        layers.append(model.policy.action_net)
        artifact = {
            "version": spec["version"], "features": spec["features"], "actions": spec["actions"],
            "activation": "tanh",
            "layers": [{"weight": layer.weight.detach().cpu().tolist(), "bias": layer.bias.detach().cpu().tolist()} for layer in layers],
            "metadata": {"created_utc": datetime.now(timezone.utc).isoformat(),
                         "algorithm": "PPO", "timesteps": model.num_timesteps,
                         "checkpoint_sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
                         "scenario": spec["scenario"], "libraries": versions()},
        }
        # Verify Python actor and actual TypeScript runtime before writing a usable artifact.
        rng = np.random.default_rng(721)
        observations = [rng.uniform(-1, 1, len(spec["features"])).astype(np.float32) for _ in range(32)]
        observation, _ = env.reset(seed=721)
        for _ in range(32):
            observations.append(observation)
            action, _ = model.predict(observation, deterministic=True)
            observation, _, terminated, truncated, _ = env.step(int(action))
            if terminated or truncated:
                observation, _ = env.reset()
        maximum_error = 0.0
        for observation in observations:
            with torch.no_grad():
                tensor = torch.as_tensor(observation).reshape(1, -1)
                logits = model.policy.action_net(model.policy.mlp_extractor.policy_net(tensor)).numpy()[0]
            actual = env.request({"op": "logits", "artifact": artifact, "observation": observation.tolist()})["logits"]
            np.testing.assert_allclose(actual, logits, rtol=1e-4, atol=1e-5)
            if int(np.argmax(actual)) != int(np.argmax(logits)):
                raise AssertionError("Export changed the selected action")
            maximum_error = max(maximum_error, float(np.max(np.abs(np.asarray(actual) - logits))))
        artifact["metadata"]["parity"] = {"observations": len(observations), "max_logit_error": maximum_error}
        write_json(output, artifact)
        return artifact["metadata"]["parity"]
    finally:
        env.close()


def train(args):
    output = Path(args.output).resolve() if args.output else RUNS / datetime.now().strftime("%Y%m%d-%H%M%S")
    output.mkdir(parents=True, exist_ok=False)
    probe = BattleFleetEnv()
    try:
        spec = probe.specification
        check_env(probe, warn=True)
    finally:
        probe.close()
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    write_json(output / "run.json", {"arguments": vars(args), "libraries": versions(), "specification": spec,
                                    "git_commit": commit.stdout.strip(), "status": "training"})
    # Full resolved package list is saved for reproducing this particular run.
    import sys
    frozen = subprocess.run([sys.executable, "-m", "pip", "freeze"], capture_output=True, text=True, check=True)
    (output / "requirements-resolved.txt").write_text(frozen.stdout, encoding="utf-8")
    vector = SubprocVecEnv([make_env] * args.envs, start_method="spawn") if args.envs > 1 else DummyVecEnv([make_env])
    try:
        vector.seed(args.seed)
        if args.resume:
            model = PPO.load(args.resume, env=vector, device="cpu")
        else:
            model = new_model(vector, args.seed)
        model.tensorboard_log = str(output / "tensorboard")
        callback = ValidationCallback(output, args.eval_every, args.eval_episodes)
        if args.resume:
            callback.next_evaluation = model.num_timesteps + args.eval_every
        try:
            model.learn(total_timesteps=args.steps, callback=callback, reset_num_timesteps=not bool(args.resume))
        except KeyboardInterrupt:
            model.save(output / "interrupted")
            write_json(output / "status.json", {"status": "interrupted", "timesteps": model.num_timesteps})
            print(f"Interrupted checkpoint saved to {output / 'interrupted.zip'}")
            return
        model.save(output / "last")
        last_validation = evaluate(model, episodes=args.eval_episodes, seed=500_000)
        write_json(output / "validation-last.json", last_validation)
        score = (last_validation["win_rate"], last_validation["mean_reward"])
        if callback.best is None or score > callback.best:
            model.save(output / "best")
        best = PPO.load(output / "best.zip", device="cpu")
        report = {"model": evaluate(best, episodes=args.eval_episodes, seed=1_000_000),
                  "rule_baseline": evaluate(episodes=args.eval_episodes, seed=1_000_000)}
        write_json(output / "holdout.json", report)
        parity = export_policy(output / "best.zip", output / "policy.json")
        write_json(output / "status.json", {"status": "complete", "timesteps": model.num_timesteps, "export_parity": parity})
        print(json.dumps({"run": str(output), "model_win_rate": report["model"]["win_rate"],
                          "baseline_win_rate": report["rule_baseline"]["win_rate"], "export_parity": parity}, indent=2))
    finally:
        vector.close()


def smoke(_args):
    output = RUNS / ("smoke-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    output.mkdir(parents=True, exist_ok=False)
    env = BattleFleetEnv()
    try:
        check_env(env, warn=True)
        traces = []
        for _ in range(2):
            observation, _ = env.reset(seed=123)
            trace = [observation.tolist()]
            for index in range(60):
                observation, reward, terminated, truncated, info = env.step(index % env.action_space.n)
                trace.append([observation.tolist(), reward, terminated, truncated, info])
                if terminated or truncated:
                    break
            traces.append(trace)
        assert traces[0] == traces[1], "Seed replay differs"
    finally:
        env.close()
    vector = DummyVecEnv([make_env])
    try:
        model = new_model(vector, rollout=128)
        before = [parameter.detach().clone() for parameter in model.policy.parameters()]
        model.learn(total_timesteps=256)
        assert any(not torch.equal(old, new) for old, new in zip(before, model.policy.parameters())), "No learning update occurred"
        model.save(output / "smoke")
    finally:
        vector.close()
    parity = export_policy(output / "smoke.zip", output / "policy.json")
    python_report = evaluate(model, episodes=2, seed=123)
    runtime_report = evaluate(episodes=2, seed=123, policy_path=str(output / "policy.json"))
    assert python_report["rows"] == runtime_report["rows"], "Runtime rollout differs from Python policy"
    report = {"status": "passed", "parity": parity, "runtime_rollout_parity": True,
              "note": "Pipeline smoke test only; not a qualified gameplay model.", "evaluation": runtime_report}
    write_json(output / "smoke-report.json", report)
    print(json.dumps({"output": str(output), **report}, indent=2))


def benchmark(args):
    env = BattleFleetEnv()
    steps, episodes = 0, 0
    try:
        env.reset(seed=42)
        start = time.perf_counter()
        while steps < args.steps:
            _, _, terminated, truncated, _ = env.rule_step()
            steps += 1
            if terminated or truncated:
                episodes += 1
                env.reset()
        elapsed = time.perf_counter() - start
        print(json.dumps({"decisions": steps, "episodes": episodes, "wall_seconds": elapsed,
                          "decisions_per_second": steps / elapsed,
                          "approximate_simulated_seconds_per_wall_second": steps * 0.15 / elapsed}, indent=2))
    finally:
        env.close()


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("smoke").set_defaults(func=smoke)
    p = commands.add_parser("benchmark")
    p.add_argument("--steps", type=positive, default=2000)
    p.set_defaults(func=benchmark)
    p = commands.add_parser("train")
    p.add_argument("--steps", type=positive, default=100_000)
    p.add_argument("--envs", type=positive, choices=range(1, 17), default=4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--output")
    p.add_argument("--resume", help="Trusted local SB3 checkpoint (.zip)")
    p.add_argument("--eval-every", type=positive, default=20_000)
    p.add_argument("--eval-episodes", type=positive, default=8)
    p.set_defaults(func=train)
    p = commands.add_parser("export")
    p.add_argument("--model", required=True)
    p.add_argument("--output", required=True)
    p.set_defaults(func=lambda args: print(export_policy(args.model, args.output)))
    p = commands.add_parser("evaluate")
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--model", help="Trusted local SB3 checkpoint (.zip)")
    group.add_argument("--policy", help="Exported runtime policy (.json)")
    group.add_argument("--baseline", action="store_true")
    p.add_argument("--episodes", type=positive, default=50)
    p.add_argument("--seed", type=int, default=2_000_000)
    p.add_argument("--output")

    def run_evaluation(args):
        model = PPO.load(args.model, device="cpu") if args.model else None
        report = evaluate(model, episodes=args.episodes, seed=args.seed, policy_path=args.policy)
        if args.output:
            write_json(args.output, report)
        print(json.dumps(report, indent=2))

    p.set_defaults(func=run_evaluation)
    args = parser.parse_args()
    torch.set_num_threads(1)
    args.func(args)


if __name__ == "__main__":
    main()
