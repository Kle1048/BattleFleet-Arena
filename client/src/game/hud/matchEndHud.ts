/**
 * Task 10 — Vollbild-Scoreboard nach Match-Ende; „Weiter“ → Lobby (Seiten-Reload).
 */

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
  score: number;
  kills: number;
};

export type MatchEndHud = {
  show: (rows: MatchEndScoreRow[], mySessionId: string) => void;
  hide: () => void;
};

export function createMatchEndHud(onPlayAgain: () => void): MatchEndHud {
  const root = document.createElement("div");
  root.className = "match-end-overlay";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Match beendet");
  root.hidden = true;
  root.innerHTML = `
    <div class="match-end-panel">
      <h2 class="match-end-title">Match beendet</h2>
      <p class="match-end-sub">FFA — Punkte nur für Kills (letzter Treffer). „Weiter“: Raum verlassen, dann erneut Klasse und Name wählen.</p>
      <table class="match-end-table" aria-label="Rangliste">
        <thead>
          <tr><th>#</th><th>Spieler</th><th>Klasse</th><th>Level</th><th>Kills</th><th>Punkte</th></tr>
        </thead>
        <tbody class="match-end-tbody"></tbody>
      </table>
      <button type="button" class="match-end-replay">Weiter — Schiff wählen</button>
    </div>
  `;

  const tbody = root.querySelector(".match-end-tbody") as HTMLElement;
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
        tr.innerHTML = `<td>${idx + 1}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(r.shipClass)}</td><td>${r.level}</td><td>${r.kills}</td><td>${r.score}</td>`;
        tbody.appendChild(tr);
      });
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
      tbody.textContent = "";
    },
  };
}
