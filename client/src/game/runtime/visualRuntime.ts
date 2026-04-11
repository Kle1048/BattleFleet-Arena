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
};

export type VisualRuntime<TPlayer extends PlayerLike> = {
  visuals: Map<string, ShipVisual>;
  remoteInterp: Map<string, InterpolationBuffer>;
  ensureVisualsForPlayers: (list: ArraySchema<TPlayer>) => void;
  getStateSyncCount: () => number;
  dispose: () => void;
};

export function createVisualRuntime<TPlayer extends PlayerLike>(
  options: VisualRuntimeOptions<TPlayer>,
): VisualRuntime<TPlayer> {
  const { room, scene, mySessionId, playerListOf, getHullGltfTemplate, getMountGltfTemplate, shipHullGltf } =
    options;
  const shipRenderer = createShipRenderer(scene, mySessionId, {
    getHullGltfTemplate,
    getMountGltfTemplate,
    shipHullGltf,
  });
  const visuals = shipRenderer.getVisuals() as Map<string, ShipVisual>;
  const remoteInterp = new Map<string, InterpolationBuffer>();
  let playerListHandlersBoundTo: ArraySchema<TPlayer> | null = null;
  let stateSyncCount = 0;

  const bindPlayerListHandlers = (): void => {
    const list = playerListOf(room);
    if (list === playerListHandlersBoundTo) return;
    playerListHandlersBoundTo = list;
    list.onAdd((player) => {
      const sc = typeof player.shipClass === "string" ? player.shipClass : undefined;
      shipRenderer.ensureShip(player.id, sc);
    }, true);
    list.onRemove((player) => {
      shipRenderer.removeShip(player.id);
      remoteInterp.delete(player.id);
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
    ensureVisualsForPlayers(list) {
      if (visuals.size === list.length) return;
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
    },
  };
}
