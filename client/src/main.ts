import { createGameApp } from "./game/app/createGameApp";
import { colyseusHttpBase } from "./game/runtime/sessionBootstrap";
import { t } from "./locale/t";

const root = document.getElementById("app");
if (!root) throw new Error(t("errors.appRootMissing"));
const app = createGameApp(root);
void app.start().catch((error: unknown) => {
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  const url = colyseusHttpBase(import.meta.env.VITE_COLYSEUS_URL, window.location.hostname);
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#5ec8f5;color:#102030;font-family:system-ui;padding:24px;text-align:center;z-index:9999;";
  // Errors are text, never HTML; a renderer failure must also reach this fallback.
  banner.textContent = t("bootstrap.connectionFailed", { url, detail });
  document.body.appendChild(banner);
});

if (import.meta.hot) import.meta.hot.dispose(() => app.dispose());
