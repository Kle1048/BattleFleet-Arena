import { PlayerLifeState, isInSeaControlZone } from "@battlefleet/shared/rules";
import type { FramePlayer, FrameRuntimeState, MessageOutput, AudioOutput } from "./frameContracts";
import { t } from "../../locale/t";
import { seaControlZoneHudTransition } from "./seaControlZoneHud";

export type FrameLifeState = Pick<FrameRuntimeState, "lastLifeStateBySessionId" | "lastDamageSmokeAtBySessionId">;
export type FrameFeedbackState = Pick<FrameRuntimeState, "lastOobCountdown" | "lastAdHudIncomingAswm" | "lastSeaControlZone">;

/** State edges own death notifications. Network events must not emit a second death. */
export function updateFrameLifeFeedback<TPlayer extends FramePlayer>(options: {
  playerList: readonly TPlayer[]; playersById: ReadonlyMap<string, TPlayer>; mySessionId: string;
  state: FrameLifeState; gameMessageHud: Pick<MessageOutput, "showToast">;
  toDisplayLabel: (p: { id: string; displayName?: string }) => string;
  onShipDestroyed?: (player: TPlayer) => void;
}): void {
  const { playerList, playersById, mySessionId, state, gameMessageHud, toDisplayLabel, onShipDestroyed } = options;
  const killerLabelForVictim = (victim: TPlayer): string => {
    const kid = typeof victim.killedBySessionId === "string" ? victim.killedBySessionId.trim() : "";
    if (!kid) return "";
    const kp = playersById.get(kid);
    return kp ? toDisplayLabel(kp) : toDisplayLabel({ id: kid });
  };

  for (const p of playerList) {
    const prev = state.lastLifeStateBySessionId.get(p.id);
    if (
      prev !== undefined &&
      prev !== PlayerLifeState.AwaitingRespawn &&
      p.lifeState === PlayerLifeState.AwaitingRespawn
    ) {
      const killerName = killerLabelForVictim(p);
      if (p.id === mySessionId) {
        if (killerName) {
          gameMessageHud.showToast(
            t("toast.destroyedWaitingRespawnByKiller", { killer: killerName }),
            "danger",
            5500,
          );
        } else {
          gameMessageHud.showToast(t("toast.destroyedWaitingRespawn"), "danger", 5500);
        }
      } else if (killerName) {
        gameMessageHud.showToast(
          t("toast.playerKilledByKiller", { killer: killerName, victim: toDisplayLabel(p) }),
          "info",
          5200,
        );
      } else {
        gameMessageHud.showToast(t("toast.playerDestroyedNoKiller", { victim: toDisplayLabel(p) }), "info", 5000);
      }
      onShipDestroyed?.(p);
    }
    state.lastLifeStateBySessionId.set(p.id, p.lifeState);
  }
  for (const id of state.lastLifeStateBySessionId.keys()) {
    if (!playersById.has(id)) {
      state.lastLifeStateBySessionId.delete(id);
      state.lastDamageSmokeAtBySessionId.delete(id);
    }
  }

}

/** Warning/zone edges run even when the local visual is not available yet. */
export function updateLocalFrameFeedback(options: {
  me: FramePlayer | undefined; matchEnded: boolean; state: FrameFeedbackState;
  gameAudio: Pick<AudioOutput, "warning">; gameMessageHud: Pick<MessageOutput, "showToast">;
}): void {
  const { me, matchEnded, state, gameAudio, gameMessageHud } = options;
  if (me) {
    const oobSec = me.oobCountdownSec ?? 0;
    if (oobSec > 0 && state.lastOobCountdown <= 0 && !matchEnded) {
      gameAudio.warning();
    }
    state.lastOobCountdown = oobSec;
  }

  if (matchEnded || !me || me.lifeState === PlayerLifeState.AwaitingRespawn) {
    state.lastAdHudIncomingAswm = 0;
    state.lastSeaControlZone = null;
  } else {
    const inc = typeof me.adHudIncomingAswm === "number" ? me.adHudIncomingAswm : 0;
    const prev = state.lastAdHudIncomingAswm;
    if (!matchEnded && prev === 0 && inc > 0) {
      gameMessageHud.showToast(t("toast.vampireIncomingAd"), "info", 5500);
    }
    state.lastAdHudIncomingAswm = inc;

    const inSeaControl = isInSeaControlZone(me.x, me.z);
    const sc = seaControlZoneHudTransition(state.lastSeaControlZone, inSeaControl);
    state.lastSeaControlZone = sc.next;
    if (sc.edge === "enter") {
      gameMessageHud.showToast(t("toast.seaControlEntered"), "info", 3800);
    } else if (sc.edge === "leave") {
      gameMessageHud.showToast(t("toast.seaControlLeft"), "info", 3800);
    }
  }

}
