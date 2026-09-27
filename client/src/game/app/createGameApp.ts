import { BattleState } from "@battlefleet/shared/protocol/schema";
import { createGameScene, resetFollowCameraSmoothing } from "../scene/createGameScene";
import { gameAudio } from "../audio/gameAudio";
import { gltfAssetCache } from "../scene/gltfAssetCache";
import { disposeShipSpriteTexture } from "../scene/shipVisual";
import { loadShipAssets } from "../runtime/shipAssetLoading";
import { createGameRenderer, bindRendererResize } from "../runtime/rendererLifecycle";
import { installReflectionCameraLayerMask } from "../runtime/renderOverlayLayers";
import { installMobileBrowserChromeGuards } from "../runtime/mobileBrowserGuards";
import { createLifetime } from "../runtime/lifetime";
import { createFrameScheduler } from "../runtime/frameScheduler";
import { acquireWithTimeout } from "../runtime/asyncAcquisition";
import { colyseusHttpBase, createColyseusClient } from "../runtime/sessionBootstrap";
import { closeRoomConnection } from "../adapters/closeRoomConnection";
import { loadPersistedFollowCameraTuning } from "../runtime/followCameraTuning";
import { applyShipDebugTuning, getShipDebugTuning } from "../runtime/shipDebugTuning";
import { loadPersistedShipTuning } from "../runtime/shipTuningStorage";
import { clearPersistedClientSettings } from "../runtime/clearPersistedClientSettings";
import { AIM_CROSSHAIR_SVG } from "../input/aimCrosshairSvg";
import { pickShipLobbyChoice } from "../ui/classPicker";
import { mountSessionLoadBackdrop, removeSessionLoadBackdrop, setSessionLoadBackdropCaption } from "../ui/sessionLoadBackdrop";
import { createGameInput } from "./createGameInput";
import { createGameSession, type GameSession } from "./GameSession";
import { createSessionPresentation } from "./createSessionPresentation";
import { t } from "../../locale/t";

function getOrCreatePlayerToken(): string {
  const key = "bfa_player_token_v1";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;
  } catch {
    // Ignore storage access issues.
  }
  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  try {
    window.localStorage.setItem(key, generated);
  } catch {
    // Ignore storage write failures.
  }
  return generated;
}
/** Owns long-lived rendering/audio/assets/input and the single frame scheduler.
 * Sessions are replaceable; neither leaving nor returning to the lobby reloads
 * the page or destroys app caches. Partial startup unwinds the same ownership stack. */
export function createGameApp(root: HTMLElement) {
  const lifetime = createLifetime();
  const startup = new AbortController();
  let activeSession: GameSession | undefined;
  let starting: Promise<void> | undefined;
  let sessionNumber = 0;
  let frameFailure: unknown;
  const scheduler = createFrameScheduler(error => {
    frameFailure = error;
    dispose();
  });

  function dispose() {
    scheduler.dispose();
    startup.abort();
    activeSession?.dispose();
    activeSession = undefined;
    lifetime.dispose();
  }

  async function run() {
    window.addEventListener("beforeunload", dispose);
    lifetime.defer(() => window.removeEventListener("beforeunload", dispose));
    lifetime.defer(installMobileBrowserChromeGuards());
    lifetime.defer(removeSessionLoadBackdrop);
    document.documentElement.lang = "en";
    document.title = t("shell.documentTitle");
    const title = document.getElementById("title");
    if (title) title.textContent = t("shell.pageTitleBanner");

    // Explicit maintenance URL retains its previous reset-and-reload behavior.
    const params = new URLSearchParams(window.location.search);
    if (params.get("resetLocal") === "1") {
      clearPersistedClientSettings();
      params.delete("resetLocal");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      window.location.reload();
      dispose();
      return;
    }
    loadPersistedFollowCameraTuning();
    applyShipDebugTuning(loadPersistedShipTuning());
    mountSessionLoadBackdrop(t("sessionLoad.captionBoot"));

    // Renderer construction is inside the startup error boundary, including WebGL failures.
    const renderer = lifetime.use(createGameRenderer(root));
    lifetime.defer(() => renderer.domElement.remove());
    renderer.domElement.style.cursor = `url("data:image/svg+xml,${encodeURIComponent(AIM_CROSSHAIR_SVG)}") 16 16, crosshair`;
    lifetime.use(gltfAssetCache);
    lifetime.defer(disposeShipSpriteTexture);
    lifetime.use(gameAudio);
    const bundle = lifetime.use(await createGameScene());
    startup.signal.throwIfAborted();
    bundle.islandCollisionPolygonGroup.visible = getShipDebugTuning().showIslandCollisionPolygons;
    lifetime.defer(bindRendererResize(bundle.camera, renderer));
    lifetime.use(installReflectionCameraLayerMask(renderer, bundle.camera));
    const controls = lifetime.use(createGameInput(renderer.domElement, bundle.camera));
    const serverUrl = colyseusHttpBase(import.meta.env.VITE_COLYSEUS_URL, window.location.hostname);
    const client = createColyseusClient(serverUrl);

    while (!startup.signal.aborted) {
      mountSessionLoadBackdrop(t("sessionLoad.captionBoot"));
      const lobby = await pickShipLobbyChoice(startup.signal);
      startup.signal.throwIfAborted();
      setSessionLoadBackdropCaption(t("sessionLoad.captionJoining"));
      gameAudio.unlockFromUserGesture();
      const room = await acquireWithTimeout(
        client.joinOrCreate("battle", {
          shipClass: lobby.shipClass,
          displayName: lobby.displayName,
          playerToken: getOrCreatePlayerToken(),
        }, BattleState),
        {
          signal: startup.signal, timeoutMs: 15_000,
          timeoutMessage: t("bootstrap.joinServerTimeout", { url: serverUrl }),
          releaseLate: room => closeRoomConnection(room),
        },
      );
      if (startup.signal.aborted) { closeRoomConnection(room); break; }
      // The app retains input ownership even though each session gets fresh neutral controls.
      let roomHandedOff = false;
      try {
        const input = controls.startSession();
        resetFollowCameraSmoothing();
        roomHandedOff = true; // GameSession owns rollback from here, including constructor failures.
        activeSession = createGameSession(room, (stateSource, connection) => createSessionPresentation({
          bundle, renderer, controls: input, stateSource, connection, serverUrl,
          sessionNumber: ++sessionNumber,
          returnToLobby: () => activeSession?.dispose(),
          inspectConnection: () => room,
        }));
        gameAudio.startBackgroundAudio();
        void loadShipAssets(lobby.shipClass);
        removeSessionLoadBackdrop();
        scheduler.start(activeSession.frame);
        await activeSession.ended;
      } catch (error) {
        if (!roomHandedOff) closeRoomConnection(room);
        throw error;
      } finally {
        scheduler.stop();
        activeSession?.dispose();
        activeSession = undefined;
        controls.stopSession();
        gameAudio.stopSession();
        if (params.get("debug") === "1") {
          // Coarse local resource counters only; no participant or payload logging.
          console.debug("[lifecycle] session released", JSON.stringify({
            sessionNumber, sceneRoots: bundle.scene.children.length,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            programs: renderer.info.programs?.length ?? 0,
          }));
        }
      }
    }
    if (frameFailure !== undefined) throw frameFailure;
  }

  return {
    start() {
      if (lifetime.disposed) return Promise.reject(new Error("Game app is disposed"));
      return starting ??= run().catch(error => {
        const cancelled = startup.signal.aborted && frameFailure === undefined;
        dispose();
        if (!cancelled) throw error;
      });
    },
    dispose,
  };
}
