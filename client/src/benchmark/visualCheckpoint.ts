import { createReplay } from "./replay";
import { createAirDefenseFx } from "../game/effects/airDefenseFx";
import { seededRandom } from "./fixture";
import { withFixtureClock } from "./fixtureClock";

/** Frozen real-module scene for manual multi-angle transparency/sorting comparison. Not a timing run. */
export function createVisualCheckpoint(options: Parameters<typeof createReplay>[0], render: () => void) {
  const replay = createReplay(options);
  for (let frame = 0; frame <= 360; frame++) replay.step(frame);
  let now = 0, nextId = 0;
  const frames = new Map<number, () => void>();
  const delays = new Map<number, { at: number; run(): void }>();
  const defense = createAirDefenseFx({ now: () => now,
    request: run => { const id = ++nextId; frames.set(id, run); return id; },
    cancel: id => { frames.delete(id); },
    delay: (run, ms) => { const id = ++nextId; delays.set(id, { run, at: now + ms }); return id; },
    clearDelay: id => { delays.delete(id); },
  });
  const random = seededRandom(732);
  withFixtureClock(0, random, () => {
    defense.fire(options.scene, "sam", -40, 0, 150, 90);
    defense.fire(options.scene, "pd", 40, 40, -120, 70);
    defense.fire(options.scene, "ciws", 0, 0, 80, 80);
    defense.hit(options.scene, 30, 30, "sam");
  });
  for (now = 25; now <= 200; now += 25) withFixtureClock(now, random, () => {
    for (const [id, task] of [...delays]) if (task.at <= now) { delays.delete(id); task.run(); }
    const ready = [...frames.values()]; frames.clear();
    for (const run of ready) run();
  });
  const followPosition = options.camera.position.clone(), followRotation = options.camera.quaternion.clone();
  return {
    show(angle: "follow" | "port" | "overhead") {
      const camera = options.camera;
      if (angle === "follow") { camera.position.copy(followPosition); camera.quaternion.copy(followRotation); }
      else {
        const position: [number, number, number] = angle === "port" ? [-350, 180, 100] : [0, 650, 0.01];
        camera.position.set(...position); camera.lookAt(0, 0, 0);
      }
      camera.updateMatrixWorld(true); render();
    },
    dispose() { defense.dispose(); replay.dispose(); },
  };
}
