import type { ArraySchema } from "@colyseus/schema";
import type * as THREE from "three";
import type { ShipClassId } from "@battlefleet/shared";
import { createInterpolationBuffer, advanceIfPoseChanged, type InterpolationBuffer } from "../network/remoteInterpolation";
import type { ShipVisual } from "../scene/shipVisual";
import { createShipRenderer } from "../renderers/ships/shipRenderer";

type RoomLike = {
  state: unknown;
  onStateChange: (cb: () => void) => void;
};

type PlayerLike = {
  id: string;
  displayName?: string;
  shipClass?: string;
  x: number;
  z: number;
  headingRad: number;
  rudder: number;
  aimX: number;
  aimZ: number;
};

type VisualRuntimeOptions<TPlayer extends PlayerLike> = {
  room: RoomLike;
  scene: THREE.Scene;
  mySessionId: string;
  playerListOf: (room: { state: unknown }) => ArraySchema<TPlayer>;
  /** Optional: GLB-Template pro Schiffsklasse (aus Cache). */
  getHullGltfTemplate?: (shipClassId: ShipClassId) => THREE.Group | null;
  /** Optional: Mount-GLBs nach `visual_*`-Id (aus Cache). */
  getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
  /** @deprecated Nutze getHullGltfTemplate */
  shipHullGltf?: THREE.Group | null;
  /**
   * Wenn ein **anderer** Spieler der `playerList` hinzugefügt wird (nach initialem Snapshot),
   * z. B. Comms-Zeile in `main.ts`.
   */
  onRemotePlayerJoinedRoom?: (player: TPlayer) => void;
};

export type VisualRuntime<TPlayer extends PlayerLike> = {
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, InterpolationBuffer>;
  ensureVisualsForPlayers: (list: ArraySchema<TPlayer>) => void;
  /** z. B. `wreck:<id>` — gleicher Renderer wie Spieler-Schiffe. */
  ensureShipVisual: (sessionKey: string, shipClassId?: ShipClassId) => void;
  removeShipVisual: (sessionKey: string) => boolean;
  getStateSyncCount: () => number;
  dispose: () => void;
};

export function createVisualRuntime<TPlayer extends PlayerLike>(
  options: VisualRuntimeOptions<TPlayer>,
): VisualRuntime<TPlayer> {
  const {
    room,
    scene,
    mySessionId,
    playerListOf,
    getHullGltfTemplate,
    getMountGltfTemplate,
    shipHullGltf,
    onRemotePlayerJoinedRoom,
  } = options;
  const shipRenderer = createShipRenderer(scene, mySessionId, {
    getHullGltfTemplate,
    getMountGltfTemplate,
    shipHullGltf,
  });
  const visuals = shipRenderer.getVisuals() as Map<string, ShipVisual>;
  const remoteInterp = new Map<string, InterpolationBuffer>();
  let playerListHandlersBoundTo: ArraySchema<TPlayer> | null = null;
  let stateSyncCount = 0;
  let lastEnsurePlayerCount = -1;
  const lastEnsureShipClassById = new Map<string, string>();
  /** Verhindert Doppel-Toasts bei `onAdd(..., true)` und List-Rebind; Leave entfernt. */
  const joinAnnounceSeen = new Set<string>();

  const bindPlayerListHandlers = (): void => {
    const list = playerListOf(room);
    if (list === playerListHandlersBoundTo) return;
    playerListHandlersBoundTo = list;
    let hydratingInitialOnAdd = true;
    list.onAdd((player) => {
      const sc = typeof player.shipClass === "string" ? player.shipClass : undefined;
      shipRenderer.ensureShip(player.id, sc);
      if (player.id === mySessionId) return;
      if (!onRemotePlayerJoinedRoom) return;
      if (hydratingInitialOnAdd) {
        joinAnnounceSeen.add(player.id);
        return;
      }
      if (joinAnnounceSeen.has(player.id)) return;
      joinAnnounceSeen.add(player.id);
      onRemotePlayerJoinedRoom(player);
    }, true);
    hydratingInitialOnAdd = false;
    list.onRemove((player) => {
      shipRenderer.removeShip(player.id);
      remoteInterp.delete(player.id);
      lastEnsureShipClassById.delete(player.id);
      joinAnnounceSeen.delete(player.id);
    });
  };

  room.onStateChange(() => {
    stateSyncCount += 1;
    bindPlayerListHandlers();
    const t = performance.now();
    const list = playerListOf(room);
    for (const p of list) {
      if (p.id === mySessionId) continue;
      const buf = remoteInterp.get(p.id);
      if (!buf) {
        remoteInterp.set(p.id, createInterpolationBuffer(p, t));
      } else {
        advanceIfPoseChanged(buf, p, t);
      }
    }
  });

  bindPlayerListHandlers();

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
      return stateSyncCount;
    },
    dispose() {
      shipRenderer.dispose();
      remoteInterp.clear();
      playerListHandlersBoundTo = null;
      lastEnsurePlayerCount = -1;
      lastEnsureShipClassById.clear();
      joinAnnounceSeen.clear();
    },
  };
}
