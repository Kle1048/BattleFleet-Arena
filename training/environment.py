"""Gymnasium adapter. Each environment owns a headless TypeScript subprocess."""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading

import gymnasium as gym
import numpy as np

ROOT = Path(__file__).resolve().parents[1]


class BattleFleetEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, policy_path: str | None = None, profile: str | None = None):
        super().__init__()
        node = shutil.which("node")
        if not node:
            raise RuntimeError("Node.js must be available on PATH")
        command = [node, "--conditions=bfa-source", "--import", "tsx",
                   str(ROOT / "server/src/training/worker.ts")]
        command.extend([str(Path(policy_path).resolve()) if policy_path else "", profile or ""])
        self.process = subprocess.Popen(
            command, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=None, text=True, encoding="utf-8", bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        self.responses: queue.Queue = queue.Queue()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()
        try:
            self.specification = self.request({"op": "describe"})
            self.observation_space = gym.spaces.Box(-1, 1, (len(self.specification["features"]),), dtype=np.float32)
            self.action_space = gym.spaces.Discrete(len(self.specification["actions"]))
        except Exception:
            self.close()
            raise

    def _read(self):
        try:
            for line in self.process.stdout:
                self.responses.put(line)
        finally:
            self.responses.put(None)

    def request(self, payload):
        if self.process.poll() is not None:
            raise RuntimeError(f"Simulation exited with code {self.process.returncode}")
        self.process.stdin.write(json.dumps(payload, allow_nan=False) + "\n")
        self.process.stdin.flush()
        try:
            line = self.responses.get(timeout=30)
        except queue.Empty as error:
            self.process.kill()
            self.process.wait()
            raise RuntimeError("Simulation response timed out after 30 seconds") from error
        if line is None:
            raise RuntimeError("Simulation pipe closed unexpectedly; see stderr")
        response = json.loads(line)
        if not response["ok"]:
            raise RuntimeError(response["error"])
        return response["result"]

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        # Explicit seeds reproduce exactly; subsequent resets draw deterministic episode seeds.
        episode_seed = int(seed) if seed is not None else int(self.np_random.integers(0, 500_000))
        result = self.request({"op": "reset", "seed": episode_seed})
        return np.asarray(result["observation"], dtype=np.float32), result["info"]

    def step(self, action):
        if not self.action_space.contains(action):
            raise ValueError(f"Invalid action: {action}")
        return self._step(int(action))

    def rule_step(self):
        """Evaluation-only baseline; -1 is never part of the learner's action space."""
        return self._step(-1)

    def _step(self, action):
        result = self.request({"op": "step", "action": action})
        return (np.asarray(result["observation"], dtype=np.float32), float(result["reward"]),
                result["terminated"], result["truncated"], result["info"])

    def close(self):
        process = getattr(self, "process", None)
        if process is None:
            return
        if process.poll() is None:
            try:
                process.stdin.write('{"op":"close"}\n')
                process.stdin.flush()
                process.wait(timeout=3)
            except (OSError, subprocess.TimeoutExpired):
                process.kill()
                process.wait(timeout=3)
        if process.stdin:
            process.stdin.close()
        self.reader.join(timeout=1)
        if process.stdout:
            process.stdout.close()
