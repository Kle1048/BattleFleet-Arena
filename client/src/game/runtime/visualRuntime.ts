import type * as THREE from "three";
import type { ShipClassId } from "@battlefleet/shared";
import type { BattleStateSource, PlayerView } from "../presentation/BattleReadModel";
import { createInterpolationBuffer, advanceIfPoseChanged, type InterpolationBuffer } from "../network/remoteInterpolation";
import type { ShipVisual } from "../scene/shipVisual";
import { createShipRenderer } from "../renderers/ships/shipRenderer";

type VisualRuntimeOptions = {
  stateSource: BattleStateSource;
  scene: THREE.Scene;
  mySessionId: string;
  /** Optional: GLB-Template pro Schiffsklasse (aus Cache). */
  getHullGltfTemplate?: (shipClassId: ShipClassId) => THREE.Group | null;
  /** Optional: Mount-GLBs nach `visual_*`-Id (aus Cache). */
  getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
  loadShipAssets?: (shipClassId: ShipClassId) => Promise<void> | undefined;
  /**
   * Wenn ein **anderer** Spieler der `playerList` hinzugefügt wird (nach initialem Snapshot),
   * z. B. Comms-Zeile in `main.ts`.
   */
  onRemotePlayerJoinedRoom?: (player: PlayerView) => void;
};

export type VisualRuntime = {
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, InterpolationBuffer>;
  ensureVisualsForPlayers: (list: readonly PlayerView[]) => void;
  /** z. B. `wreck:<id>` — gleicher Renderer wie Spieler-Schiffe. */
  ensureShipVisual: (sessionKey: string, shipClassId?: ShipClassId) => void;
  removeShipVisual: (sessionKey: string) => boolean;
  getStateSyncCount: () => number;
  dispose: () => void;
};

export function createVisualRuntime(options: VisualRuntimeOptions): VisualRuntime {
  const {
    stateSource,
    scene,
    mySessionId,
    getHullGltfTemplate,
    getMountGltfTemplate,
    loadShipAssets,
    onRemotePlayerJoinedRoom,
  } = options;
  const shipRenderer = createShipRenderer(scene, mySessionId, {
    getHullGltfTemplate,
    getMountGltfTemplate,
    loadShipAssets,
  });
  const visuals = shipRenderer.getVisuals() as Map<string, ShipVisual>;
  const remoteInterp = new Map<string, InterpolationBuffer>();
  let disposed = false;
  let lastEnsurePlayerCount = -1;
  const lastEnsureShipClassById = new Map<string, string>();
  // Hydration is silent. Subsequent membership notifications are emitted once by the adapter.
  for (const player of stateSource.model.playerList) shipRenderer.ensureShip(player.id, player.shipClass);
  const unsubscribe = stateSource.subscribe({
    onPlayerAdded(player) {
      const sc = typeof player.shipClass === "string" ? player.shipClass : undefined;
      shipRenderer.ensureShip(player.id, sc);
      if (player.id === mySessionId) return;
      onRemotePlayerJoinedRoom?.(player);
    },
    onPlayerRemoved(player) {
      shipRenderer.removeShip(player.id);
      remoteInterp.delete(player.id);
      lastEnsureShipClassById.delete(player.id);
    },
    onState(receivedAtMs) {
      for (const p of stateSource.model.playerList) {
        if (p.id === mySessionId) continue;
        const buf = remoteInterp.get(p.id);
        if (!buf) {
          remoteInterp.set(p.id, createInterpolationBuffer(p, receivedAtMs));
        } else {
          advanceIfPoseChanged(buf, p, receivedAtMs);
        }
      }
    },
  });

  return {
    visuals,
    remoteInterp,
    ensureShipVisual: (sessionKey, shipClassId) => {
      shipRenderer.ensureShip(sessionKey, shipClassId);
    },
    removeShipVisual: (sessionKey) => shipRenderer.removeShip(sessionKey),
    ensureVisualsForPlayers(list) {
      const n = list.length;
      let dirty = n !== lastEnsurePlayerCount;
      lastEnsurePlayerCount = n;
      const present = new Set<string>();
      for (const p of list) {
        present.add(p.id);
        const sc = typeof p.shipClass === "string" ? p.shipClass : "";
        if (lastEnsureShipClassById.get(p.id) !== sc) {
          dirty = true;
          lastEnsureShipClassById.set(p.id, sc);
        }
      }
      for (const id of lastEnsureShipClassById.keys()) {
        if (!present.has(id)) {
          lastEnsureShipClassById.delete(id);
          dirty = true;
        }
      }
      if (!dirty) return;
      for (const p of list) {
        const sc = typeof p.shipClass === "string" ? p.shipClass : undefined;
        shipRenderer.ensureShip(p.id, sc);
      }
    },
    getStateSyncCount() {
      return stateSource.model.stateSyncCount;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      shipRenderer.dispose();
      remoteInterp.clear();
      lastEnsurePlayerCount = -1;
      lastEnsureShipClassById.clear();
    },
  };
}
