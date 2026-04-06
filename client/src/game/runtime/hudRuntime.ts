type DebugOverlayLike = {
  update: (model: {
    fps: number;
    roomId: string;
    playerCount: number;
    pingMs: number | null;
    diag?: string;
    warn?: string;
  }) => void;
};

type MatchEndHudLike = {
  show: (
    rows: { sessionId: string; displayName: string; score: number; kills: number }[],
    mySessionId: string,
  ) => void;
  hide: () => void;
};

type HudPlayerLike = {
  id: string;
  displayName?: string;
  score?: number;
  kills?: number;
};

type CreateHudRuntimeOptions = {
  debugOverlay: DebugOverlayLike;
  matchEndHud: MatchEndHudLike;
  mySessionId: string;
  joinedAt: number;
};

export function createHudRuntime(options: CreateHudRuntimeOptions): {
  updateDebugOverlay: (params: {
    now: number;
    roomState: unknown;
    roomId: string;
    playerCount: number;
    pingMs: number | null;
    stateSyncCount: number;
    colyseusWarn: string;
    fps: number;
    frameTimeMs?: number;
    perfMetrics?: {
      artillery?: { activeShells: number; activeTransientFx: number; pooledTransientMeshes: number };
      missile?: { activeMissiles: number; activeImpactRings: number; pooledImpactRings: number };
      torpedo?: { activeTorpedoes: number; activeImpactRings: number; pooledImpactRings: number };
    };
  }) => void;
  updateMatchEndHud: (params: {
    matchEnded: boolean;
    players: Iterable<HudPlayerLike>;
  }) => void;
} {
  const { debugOverlay, matchEndHud, mySessionId, joinedAt } = options;

  return {
    updateDebugOverlay({
      now,
      roomState,
      roomId,
      playerCount,
      pingMs,
      stateSyncCount,
      colyseusWarn,
      fps,
      frameTimeMs,
      perfMetrics,
    }) {
      let warn = colyseusWarn;
      if (!warn && now - joinedAt > 4_000 && stateSyncCount === 0) {
        warn = "Kein ROOM_STATE (Sync 0): WebSocket-ACK? Server-Terminal prüfen. Konsole: Filter „Warnungen“.";
      } else if (!warn && playerCount === 0 && now - joinedAt > 2_500 && stateSyncCount > 0) {
        warn = "Sync ok, playerList leer: Server-Log onJoin? Oder zweiten Tab testen.";
      } else if (!warn && playerCount === 0 && now - joinedAt > 2_500) {
        warn = "Spieler 0: Sync wartet oder fehlt — siehe graue Diagnose, Server-Terminal.";
      }
      const jsonKeys =
        roomState && typeof roomState === "object"
          ? Object.keys(roomState as object)
              .filter((k) => !k.startsWith("$") && k !== "constructor")
              .join(", ")
          : "—";
      const perfLine =
        perfMetrics != null
          ? `\nFX A[s:${perfMetrics.artillery?.activeShells ?? 0}|t:${perfMetrics.artillery?.activeTransientFx ?? 0}|p:${perfMetrics.artillery?.pooledTransientMeshes ?? 0}] ` +
            `M[m:${perfMetrics.missile?.activeMissiles ?? 0}|i:${perfMetrics.missile?.activeImpactRings ?? 0}|p:${perfMetrics.missile?.pooledImpactRings ?? 0}] ` +
            `T[t:${perfMetrics.torpedo?.activeTorpedoes ?? 0}|i:${perfMetrics.torpedo?.activeImpactRings ?? 0}|p:${perfMetrics.torpedo?.pooledImpactRings ?? 0}]`
          : "";
      const frameLine =
        typeof frameTimeMs === "number" && Number.isFinite(frameTimeMs)
          ? `\nFrame ${frameTimeMs.toFixed(1)} ms`
          : "";
      debugOverlay.update({
        fps,
        roomId: roomId ? roomId.slice(0, 8) : "—",
        playerCount,
        pingMs,
        diag: `STATE ${stateSyncCount} | keys: ${jsonKeys}${frameLine}${perfLine}\nKonsole → __BFA`,
        warn: warn || undefined,
      });
    },

    updateMatchEndHud({ matchEnded, players }) {
      if (matchEnded) {
        const rows: { sessionId: string; displayName: string; score: number; kills: number }[] = [];
        for (const p of players) {
          rows.push({
            sessionId: p.id,
            displayName: typeof p.displayName === "string" ? p.displayName : "",
            score: typeof p.score === "number" ? p.score : 0,
            kills: typeof p.kills === "number" ? p.kills : 0,
          });
        }
        rows.sort(
          (a, b) =>
            b.score - a.score ||
            b.kills - a.kills ||
            a.sessionId.localeCompare(b.sessionId),
        );
        matchEndHud.show(rows, mySessionId);
      } else {
        matchEndHud.hide();
      }
    },
  };
}
