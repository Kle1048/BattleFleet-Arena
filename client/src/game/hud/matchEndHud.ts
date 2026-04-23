/**
 * Task 10 — Vollbild-Scoreboard nach Match-Ende; „Weiter“ → Lobby (Seiten-Reload).
 */

import { progressionNavalRankEn } from "@battlefleet/shared";
import { t } from "../../locale/t";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MatchEndScoreRow = {
  sessionId: string;
  /** Anzeigename (serverseitig bereinigt); Fallback in `show` möglich. */
  displayName: string;
  shipClass: string;
  level: number;
  /** Runden-Score — primäres Siegkriterium. */
  score: number;
  kills: number;
};

export type MatchEndHud = {
  show: (rows: MatchEndScoreRow[], mySessionId: string) => void;
  setOverallLeaderboard: (state: {
    status: "loading" | "error" | "ready";
    rows?: Array<{
      displayName: string;
      scoreTotal: number;
      kills: number;
      wins: number;
      matches: number;
    }>;
  }) => void;
  hide: () => void;
};

export function createMatchEndHud(onPlayAgain: () => void): MatchEndHud {
  const root = document.createElement("div");
  root.className = "match-end-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", t("matchEnd.ariaDialog"));
  root.hidden = true;
  root.innerHTML = `
    <div class="match-end-panel">
      <h2 class="match-end-title">${t("matchEnd.title")}</h2>
      <p class="match-end-sub">${t("matchEnd.subtitle")}</p>
      <table class="match-end-table" aria-label="${t("matchEnd.tableAria")}">
        <thead>
          <tr><th>${t("matchEnd.colPlace")}</th><th>${t("matchEnd.colPlayer")}</th><th>${t("matchEnd.colClass")}</th><th>${t("matchEnd.colRank")}</th><th>${t("matchEnd.colKills")}</th><th>${t("matchEnd.colScore")}</th></tr>
        </thead>
        <tbody class="match-end-tbody"></tbody>
      </table>
      <section class="match-end-overall">
        <h3 class="match-end-overall-title">${t("matchEnd.overallTitle")}</h3>
        <p class="match-end-overall-status">${t("matchEnd.overallLoading")}</p>
        <table class="match-end-overall-table" aria-label="${t("matchEnd.overallTableAria")}" hidden>
          <thead>
            <tr><th>${t("matchEnd.colPlace")}</th><th>${t("matchEnd.colPlayer")}</th><th>${t("matchEnd.colScore")}</th><th>${t("matchEnd.colKills")}</th><th>${t("matchEnd.colOverallWins")}</th><th>${t("matchEnd.colOverallMatches")}</th></tr>
          </thead>
          <tbody class="match-end-overall-tbody"></tbody>
        </table>
      </section>
      <button type="button" class="match-end-replay">${t("matchEnd.continue")}</button>
    </div>
  `;

  const tbody = root.querySelector(".match-end-tbody") as HTMLElement;
  const overallStatus = root.querySelector(".match-end-overall-status") as HTMLElement;
  const overallTable = root.querySelector(".match-end-overall-table") as HTMLTableElement;
  const overallTbody = root.querySelector(".match-end-overall-tbody") as HTMLElement;
  const replayBtn = root.querySelector(".match-end-replay") as HTMLButtonElement;

  replayBtn.addEventListener("click", () => {
    onPlayAgain();
  });

  document.body.appendChild(root);

  return {
    show(rows: MatchEndScoreRow[], mySessionId: string): void {
      tbody.textContent = "";
      rows.forEach((r, idx) => {
        const tr = document.createElement("tr");
        if (r.sessionId === mySessionId) tr.classList.add("match-end-row-me");
        const label =
          typeof r.displayName === "string" && r.displayName.trim().length > 0
            ? r.displayName.trim()
            : r.sessionId.length <= 10
              ? r.sessionId
              : `${r.sessionId.slice(0, 4)}…${r.sessionId.slice(-4)}`;
        const rankEn = escapeHtml(progressionNavalRankEn(r.level));
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(r.shipClass)}</td><td>${rankEn}</td><td>${r.kills}</td><td>${r.score}</td>`;
        tbody.appendChild(tr);
      });
      overallStatus.textContent = t("matchEnd.overallLoading");
      overallTable.hidden = true;
      overallTbody.textContent = "";
      root.hidden = false;
    },
    setOverallLeaderboard(state): void {
      if (state.status === "loading") {
        overallStatus.textContent = t("matchEnd.overallLoading");
        overallTable.hidden = true;
        overallTbody.textContent = "";
        return;
      }
      if (state.status === "error") {
        overallStatus.textContent = t("matchEnd.overallUnavailable");
        overallTable.hidden = true;
        overallTbody.textContent = "";
        return;
      }
      const rows = Array.isArray(state.rows) ? state.rows : [];
      if (rows.length < 1) {
        overallStatus.textContent = t("matchEnd.overallEmpty");
        overallTable.hidden = true;
        overallTbody.textContent = "";
        return;
      }
      overallStatus.textContent = "";
      overallTable.hidden = false;
      overallTbody.textContent = "";
      rows.forEach((r, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(r.displayName || "—")}</td><td>${Math.floor(r.scoreTotal)}</td><td>${Math.floor(r.kills)}</td><td>${Math.floor(r.wins)}</td><td>${Math.floor(r.matches)}</td>`;
        overallTbody.appendChild(tr);
      });
    },
    hide(): void {
      root.hidden = true;
      tbody.textContent = "";
      overallTbody.textContent = "";
      overallStatus.textContent = t("matchEnd.overallLoading");
      overallTable.hidden = true;
    },
  };
}
