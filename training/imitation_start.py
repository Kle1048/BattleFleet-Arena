"""Local behavioral-cloning warm start, followed separately by real PPO training.

The teacher uses only the policy's sensor-filtered observations. It demonstrates
mission return, available attacks, and emergency retreat; it has no hidden enemy
positions. This script does not install a scripted bot in the game.
"""
import argparse
import hashlib
from pathlib import Path

import numpy as np
import torch
from camp import PPO, new_model, make_env, write_json
from stable_baselines3.common.vec_env import DummyVecEnv


def teacher(observation, features, actions):
    o = dict(zip(features, observation))
    if o["hp"] < 0.25 and o["target.present"] and o["target.distance/2000"] < 0.1:
        action = "RETREAT"
    elif o["hp"] < 0.35 and o["incoming/8"] > 0 and o["nearestMissile.present"]:
        action = "EVADE_MISSILES"
    elif o["target.present"] or o["esm.count/8"] > 0:
        action = "ATTACK"
    else:
        action = "SEEK_SEA_CONTROL"
    return actions.index(action)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", required=True, help="Trusted local checkpoint")
    p.add_argument("--opponent-policy", required=True)
    p.add_argument("--profile", choices=["cautious", "objective"], required=True)
    p.add_argument("--output", required=True)
    args = p.parse_args()
    output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
    torch.set_num_threads(1); torch.manual_seed(123)
    env = make_env(args.profile, args.opponent_policy)
    observations, labels = [], []
    try:
        spec = env.unwrapped.specification
        obs, _ = env.reset(seed=123)
        for _ in range(16000):
            action = teacher(obs, spec["features"], spec["actions"])
            observations.append(obs.copy()); labels.append(action)
            obs, _, terminated, truncated, _ = env.step(action)
            if terminated or truncated:
                obs, _ = env.reset()
    finally:
        env.close()
    vector = DummyVecEnv([lambda: make_env(args.profile, args.opponent_policy)])
    try:
        model = new_model(vector, seed=123, gamma=0.998)
        source = PPO.load(args.source, device="cpu")
        if any(source.bfa_specification[k] != spec[k] for k in ["version", "features", "actions"]):
            raise ValueError("Incompatible teacher initialization features/actions")
        model.policy.load_state_dict(source.policy.state_dict())
        model.bfa_specification = spec
        model.bfa_opponent_policy = str(Path(args.opponent_policy).resolve())
        x = torch.as_tensor(np.asarray(observations), dtype=torch.float32)
        y = torch.as_tensor(labels, dtype=torch.long)
        optimizer = torch.optim.Adam(list(model.policy.mlp_extractor.policy_net.parameters()) + list(model.policy.action_net.parameters()), lr=3e-4)
        for _ in range(20):
            for indices in torch.randperm(len(y)).split(256):
                logits = model.policy.action_net(model.policy.mlp_extractor.policy_net(x[indices]))
                loss = torch.nn.functional.cross_entropy(logits, y[indices])
                optimizer.zero_grad(); loss.backward(); optimizer.step()
        with torch.no_grad():
            logits = model.policy.action_net(model.policy.mlp_extractor.policy_net(x))
            accuracy = float((logits.argmax(1) == y).float().mean())
        model.save(output / "warmstart")
        write_json(output / "imitation.json", {"teacher_steps":len(y), "epochs":20, "training_accuracy":accuracy,
            "labels":{a:labels.count(i) for i,a in enumerate(spec["actions"])},
            "source":str(Path(args.source).resolve()),"source_sha256":hashlib.sha256(Path(args.source).read_bytes()).hexdigest(),
            "specification":spec,"note":"Supervised imitation on observed states; training accuracy is not gameplay qualification. Follow with PPO and independent matches."})
        print("Imitation complete", accuracy, flush=True)
    finally:
        vector.close()


if __name__ == "__main__":
    main()
