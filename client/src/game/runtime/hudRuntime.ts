import { t } from "../../locale/t";

type DebugOverlayLike = {
  update: (model: {
    fps: number;
    roomId: string;
    playerCount: number;
    pingMs: number | null;
    frameMs?: number | null;
    diag?: string;
    warn?: string;
  }) => void;
};

type MatchEndHudLike = {
  show: (
    rows: {
      sessionId: string;
      displayName: string;
      shipClass: string;
      level: number;
      score: number;
      kills: number;
    }[],
    mySessionId: string,
  ) => void;
  hide: () => void;
};

type HudPlayerLike = {
  id: string;
  displayName?: string;
  shipClass?: string;
  level?: number;
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
    extraDiagLine?: string;
    perfMetrics?: {
      artillery?: { activeShells: number };
      missile?: { activeMissiles: number };
      torpedo?: { activeTorpedoes: number };
      fx?: { activeParticles: number; pooledParticles: number };
    };
  }) => void;
  updateMatchEndHud: (params: {
    matchEnded: boolean;
    players: Iterable<HudPlayerLike>;
  }) => void;
} {
  const { debugOverlay, matchEndHud, mySessionId, joinedAt } = options;
  /** Verhindert ~60×/s `show()` während `MATCH_PHASE_ENDED` (DOM-Neuaufbau / „flackert“). */
  let matchEndScoreboardShown = false;

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
      extraDiagLine,
      perfMetrics,
    }) {
      let warn = colyseusWarn;
      if (!warn && now - joinedAt > 4_000 && stateSyncCount === 0) {
        warn = t("debugHud.warnNoRoomStateSync");
      } else if (!warn && playerCount === 0 && now - joinedAt > 2_500 && stateSyncCount > 0) {
        warn = t("debugHud.warnPlayerListEmpty");
      } else if (!warn && playerCount === 0 && now - joinedAt > 2_500) {
        warn = t("debugHud.warnZeroPlayersWaiting");
      }
      const jsonKeys =
        roomState && typeof roomState === "object"
          ? Object.keys(roomState as object)
              .filter((k) => !k.startsWith("$") && k !== "constructor")
              .join(", ")
          : "—";
      const perfLine =
        perfMetrics != null
          ? `\nFX part[a:${perfMetrics.fx?.activeParticles ?? 0}|p:${perfMetrics.fx?.pooledParticles ?? 0}] ` +
            `A[shells:${perfMetrics.artillery?.activeShells ?? 0}] ` +
            `M[aswm:${perfMetrics.missile?.activeMissiles ?? 0}] ` +
            `T[torp:${perfMetrics.torpedo?.activeTorpedoes ?? 0}]`
          : "";
      const frameLine =
        typeof frameTimeMs === "number" && Number.isFinite(frameTimeMs)
          ? `\nFrame ${frameTimeMs.toFixed(1)} ms`
          : "";
      const extraDiag = extraDiagLine ? `\n${extraDiagLine}` : "";
      debugOverlay.update({
        fps,
        roomId: roomId ? roomId.slice(0, 8) : "—",
        playerCount,
        pingMs,
        frameMs: frameTimeMs,
        diag: `STATE ${stateSyncCount} | keys: ${jsonKeys}${frameLine}${perfLine}${extraDiag}\n${t("debugHud.consoleHint")}`,
        warn: warn || undefined,
      });
    },

    updateMatchEndHud({ matchEnded, players }) {
      if (matchEnded) {
        if (matchEndScoreboardShown) return;
        const rows: {
          sessionId: string;
          displayName: string;
          shipClass: string;
          level: number;
          score: number;
          kills: number;
        }[] = [];
        for (const p of players) {
          rows.push({
            sessionId: p.id,
            displayName: typeof p.displayName === "string" ? p.displayName : "",
            shipClass: typeof p.shipClass === "string" ? p.shipClass : "—",
            level: typeof p.level === "number" ? Math.max(1, Math.floor(p.level)) : 1,
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
        matchEndScoreboardShown = true;
      } else {
        if (matchEndScoreboardShown) {
          matchEndHud.hide();
          matchEndScoreboardShown = false;
        }
      }
    },
  };
}
