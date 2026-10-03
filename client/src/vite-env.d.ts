/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Volle HTTP(S)/WS(S)-Basis für `colyseus.js` (Build-Zeit). Unset → gleicher Host wie die Seite, Port 2567, `http://`. */
  readonly VITE_COLYSEUS_URL?: string;
  /** Statischer Asset-Pfad (z. B. GitHub Pages `/repo/`). */
  readonly VITE_BASE_PATH?: string;
  readonly VITE_FEEDBACK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BFA_BUILD__: { id: string; revision: string; sourceHash: string; dirty: boolean | null };
