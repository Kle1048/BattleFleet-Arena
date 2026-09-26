import { createBotDebugPanel } from "../bot/botDebugPanel";
import { createEnvironmentDebugPanel, type EnvironmentDebugPanelOptions } from "./environmentDebugPanel";
import type { GameSceneBundle } from "../scene/createGameScene";

export function createDebugTools(bundle: GameSceneBundle, environmentOptions: EnvironmentDebugPanelOptions,
  onSetEnabled: (enabled: boolean) => void) {
  const environment = createEnvironmentDebugPanel(bundle, environmentOptions);
  try {
    const bot = createBotDebugPanel({ onSetEnabled });
    return { renderBot: bot.render, dispose() { bot.dispose(); environment.dispose(); } };
  } catch (error) { environment.dispose(); throw error; }
}
