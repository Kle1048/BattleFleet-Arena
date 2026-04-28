/**
 * English UI copy — single source for client-facing strings (Variant A).
 * Each key has a short comment pointing to call sites / DOM.
 */

export const en = {
  /** Product name — use `fullName` in UI titles; `shortName` where space is tight. */
  product: {
    /** Visible game title (e.g. class picker, marketing). */
    fullName: "Sea Control: Arena",
    /** Abbreviation (HUD chrome, compact labels). */
    shortName: "SCA",
  },

  /**
   * main.ts — tab title and `#title`. `#hud` help copy is kept here for later; the panel is
   * `display: none` in index.html until re-enabled.
   */
  shell: {
    /** main.ts — `document.title` on startup. */
    documentTitle: "Sea Control: Cold War Arena",
    /** main.ts — visible `#title` above the game canvas. */
    pageTitleBanner: "Sea Control: Cold WarArena — naval combat in the missile age",
    /** Reserved — `#hud` row 1 when help panel is shown again. */
    helpHudLine1: "W / S — engine ahead / astern while held (M toggles step mode)",
    /** Reserved — `#hud` row 2 when help panel is shown again. */
    helpHudLine2: "A / D — rudder port / starboard while held (M toggles step mode)",
    /** Reserved — `#hud` row 3 when help panel is shown again. */
    helpHudLine3: "Mouse move — aim line (firing arc toward the bow)",
    /** Reserved — `#hud` row 4 when help panel is shown again. */
    helpHudLine4: "Space or left mouse button — primary / naval gun (hold; ~0.5 s cooldown)",
    /** Reserved — `#hud` row 5 when help panel is shown again. */
    helpHudLine5: "Click an enemy ship or press F — fire-control channel (hold target; fire as usual)",
    /** Reserved — `#hud` row 6 when help panel is shown again. */
    helpHudLine6:
      "Click water / sky or Esc — clear fire-control channel · Hold Q (port) / E (starboard) for fixed SSM rails, or right mouse for aim-based SSM",
  },

  /** main.ts — hard failures before/during bootstrap. */
  errors: {
    /** main.ts — `#app` missing in index.html. */
    appRootMissing: "#app container missing",
    /** main.ts — cockpit markup missing from DOM. */
    cockpitHudMissing: "Cockpit HUD missing (.cockpit-bridge / .cockpit-opz).",
  },

  /** main.ts — first comms log line after join. */
  comms: {
    /**
     * main.ts — `commsLog.append` on successful room join; `{roomId}` = short `room.roomId` slice.
     */
    roomChannelOpen: "CIC channel open — room {roomId}…",
    /**
     * visualRuntime.ts → `main.ts` — another human/bot entered the match; `{name}` = `playerDisplayLabel`.
     */
    playerJoined: "{name} joined",
  },

  toast: {
    /**
     * frameRuntime.ts — `showToast` when the local player transitions to `awaiting_respawn`.
     */
    destroyedWaitingRespawn: "Destroyed — waiting for respawn…",
    /**
     * frameRuntime.ts — local player destroyed by another; `{killer}` = `playerDisplayLabel` of killer.
     */
    destroyedWaitingRespawnByKiller: "Destroyed by {killer} — waiting for respawn…",
    /**
     * frameRuntime.ts — kill feed when killer is known; `{killer}` / `{victim}` = display labels.
     */
    playerKilledByKiller: "{killer} destroyed {victim}",
    /**
     * frameRuntime.ts — victim died with no attributed killer (OOB, island scrape, etc.); `{victim}` = label.
     */
    playerDestroyedNoKiller: "{victim} destroyed",
    /**
     * frameRuntime.ts — `showToast` when incoming ASuM count goes from 0 to &gt;0 (air defense hint).
     */
    vampireIncomingAd: "Vampire! Vampire! Vampire!",
    /**
     * frameRuntime.ts — local player crosses into the central Sea Control Area (passive score zone).
     */
    seaControlEntered: "Sea Control Area — entered",
    /**
     * frameRuntime.ts — local player leaves the Sea Control Area.
     */
    seaControlLeft: "Sea Control Area — left",
    /**
     * frameRuntime.ts — `showToast` on progression level-up; `{level}`, `{rank}` = naval rank string.
     */
    levelRank: "Level {level}: {rank}",
    /**
     * main.ts — `onAswmMagazineReloaded` network handler (magazine refill toast).
     */
    aswmMagazineReloaded: "SSM: Magic Reload!",
    /**
     * main.ts — `onSoftkillResult` softkill ECM result (success).
     */
    softkillSuccess: "Softkill successful",
    /**
     * main.ts — `onSoftkillResult` softkill ECM result (failure).
     */
    softkillFailed: "Softkill failed",
    /**
     * main.ts — Plan A Feel: artillery splash damaged local hull (radius check on `artyImpact`).
     */
    feelArtilleryHullHit: "Shell hit — hull damage",
    /**
     * main.ts — Plan A Feel: ASuM impact near local player (`aswmImpact` radius check).
     */
    feelAswmImpactNear: "Missile warhead — close aboard",
  },

  messageHud: {
    /**
     * gameMessageHud.ts — `updateFrame` when OOB countdown is active (title row).
     */
    oobTitle: "Leaving the operational area — turn back immediately.",
    /**
     * gameMessageHud.ts — `updateFrame` when spawn protection is active (title row).
     */
    spawnShieldTitle: "Spawn protection active",
    /**
     * gameMessageHud.ts — OOB countdown subtitle; `{seconds}` = ceil seconds (integer).
     */
    oobCountdownSeconds: "{seconds} s",
    /**
     * gameMessageHud.ts — spawn protection subtitle; `{seconds}` = one decimal place.
     */
    spawnShieldSeconds: "{seconds} s",
  },

  /** main.ts — fatal bootstrap / connection failure UI. */
  bootstrap: {
    /**
     * main.ts — `bootstrap().catch` fullscreen banner; `{url}` = Colyseus URL, `{detail}` = error text.
     */
    connectionFailed:
      'Cannot connect ({url}): {detail} — start server: "npm run dev -w server".',
    /**
     * main.ts — `debugOverlayForFatal.update` warn line; `{detail}` = error message.
     */
    fatalServerHint: "{detail}\n→ npm run dev -w server",
    /**
     * main.ts — fatal overlay `roomId` when bootstrap fails (debug metrics).
     */
    roomIdFatal: "ERROR",
    /**
     * main.ts — first `debugOverlay.update` `diag` before Colyseus room is ready.
     */
    initialDebugDiag: "In the browser console, enable the \"Warnings\" filter.",
    /**
     * main.ts — first `debugOverlay.update` `warn` while connecting; `{url}` = Colyseus URL.
     */
    initialDebugWarnConnecting: "Connecting…\n{url}",
    /**
     * main.ts — `withTimeout` error joining `battle` room; `{url}` = Colyseus URL.
     */
    joinServerTimeout:
      "No response from game server. Check: is the server running? Firewall? URL: {url}",
  },

  /** messageLog.ts — scrollable comms log panel. */
  messageLog: {
    /** messageLog.ts — root `aria-label` and header title. */
    panelTitle: "Comms",
    /** messageLog.ts — clear button label. */
    clear: "Clear",
    /** messageLog.ts — clear button `title` and `aria-label`. */
    clearTitle: "Clear messages",
    /** messageLog.ts — help button label (opens mission briefing). */
    help: "Help",
    /** messageLog.ts — help button `title` and `aria-label`. */
    helpTitle: "Open mission briefing and controls help",
    /** main.ts — initial Comms line: short objective briefing. */
    initialObjective:
      "Mission: take the central Sea Control area, destroy hostile ships, and survive to earn promotions.",
    /** main.ts — initial Comms line: short movement controls. */
    initialControlsMove: "Controls: WASD steers and drives; M toggles step mode; mouse aims.",
    /** main.ts — initial Comms line: short weapon controls. */
    initialControlsFight:
      "Weapons: LMB / Space fires primary; RMB fires SSM at the locked target; Q / E fires port / starboard rails.",
    /** main.ts — initial Comms line: short systems controls. */
    initialControlsSystems:
      "Systems: F cycles fire-control target, click enemy hulls to lock, R toggles search radar, Help opens the full briefing.",
  },

  /** debugOverlay.ts — FPS / room / ping dev HUD. */
  debugOverlay: {
    /** debugOverlay.ts — compact/expand toggle `aria-label`. */
    toggleAria: "Expand or collapse debug overlay",
    /** debugOverlay.ts — toggle `title` when view is compact (expand full). */
    expandTitle: "Show full debug",
    /** debugOverlay.ts — toggle `title` when view is expanded (compact). */
    compactTitle: "FPS and ping only",
    /**
     * debugOverlay.ts — optional segment after FPS; `{ms}` = frame time ms (one decimal).
     */
    frameTimeSegment: " · Frame {ms} ms",
    /**
     * debugOverlay.ts — compact line; `{fps}` digits, `{framePart}` often empty or `frameTimeSegment`, `{ping}` e.g. "42 ms" or "—".
     */
    compactLine: "FPS {fps}{framePart} · Ping {ping}",
    /** debugOverlay.ts — full block line 1. */
    metricFps: "FPS {fps}",
    /** debugOverlay.ts — full block line 2. */
    metricRoom: "Room {roomId}",
    /** debugOverlay.ts — full block line 3. */
    metricPlayers: "Players {count}",
    /** debugOverlay.ts — full block line 4. */
    metricPing: "Ping {ping}",
  },

  /** Shared short answers for debug / bot panels. */
  common: {
    /** Boolean “yes” in debug readouts (e.g. bot panel). */
    yes: "yes",
    /** Boolean “no” in debug readouts. */
    no: "no",
  },

  /** botDebugPanel.ts — bottom-dock bot inspector. */
  botDebug: {
    /** botDebugPanel.ts — bot on/off `aria-label`. */
    toggleAria: "Enable or disable bot",
    /** botDebugPanel.ts — panel expand/collapse. */
    hide: "Hide",
    show: "Show",
    /** botDebugPanel.ts — main toggle when bot is on. */
    botOn: "Bot: ON",
    /** botDebugPanel.ts — main toggle when bot is off. */
    botOff: "Bot: OFF",
    /** botDebugPanel.ts — header when bot disabled. */
    titleDisabled: "Bot OFF (B key / button)",
    /** botDebugPanel.ts — header when bot enabled. */
    titleActive: "Bot ACTIVE (B key / button)",
    /**
     * botDebugPanel.ts — body copy when disabled (includes `<b>` for key hint).
     */
    inactiveHelpHtml:
      '<div style="opacity:0.88;">Bot is off — <b>B</b> or button to enable.</div>',
    /** botDebugPanel.ts — row label. */
    labelIntent: "Intent",
    /** botDebugPanel.ts — row label. */
    labelTarget: "Target",
    /** botDebugPanel.ts — tactical score line; placeholders are numeric strings. */
    tacticalScores: "danger: {danger} | aggr: {aggr} | surv: {surv}",
    /** botDebugPanel.ts — arc line; `{gun}` / `{missile}` = yes/no. */
    arcLine: "Gun arc: {gun} | Missile arc: {missile}",
    /** botDebugPanel.ts — incoming missiles count line; `{count}` integer. */
    incomingMissiles: "Incoming missiles: {count}",
    /** botDebugPanel.ts — section heading. */
    headingLastInputs: "Last inputs",
    /** botDebugPanel.ts — section heading. */
    headingIntentChanges: "Intent changes",
    /** botDebugPanel.ts — section heading. */
    headingDecisionLog: "Decision log",
  },

  /** matchEndHud.ts — fullscreen scoreboard after match end. */
  matchEnd: {
    /** matchEndHud.ts — root dialog `aria-label`. */
    ariaDialog: "Match ended",
    /** matchEndHud.ts — main heading. */
    title: "Match ended",
    /**
     * matchEndHud.ts — explanatory subtitle under title (rules + Continue behavior).
     */
    subtitle:
      "FFA — win: highest score (passive + combat; center ×5). Kills count. \"Continue\": leave the room and reconnect.",
    /** matchEndHud.ts — score table `aria-label`. */
    tableAria: "Scoreboard",
    /** matchEndHud.ts — all-time table `aria-label`. */
    overallTableAria: "Overall leaderboard",
    /** matchEndHud.ts — table header: placement column. */
    colPlace: "#",
    /** matchEndHud.ts — table header: player name. */
    colPlayer: "Player",
    /** matchEndHud.ts — table header: ship class. */
    colClass: "Class",
    /** matchEndHud.ts — table header: naval rank. */
    colRank: "Rank",
    /** matchEndHud.ts — table header: kills. */
    colKills: "Kills",
    /** matchEndHud.ts — table header: score. */
    colScore: "Score",
    /** matchEndHud.ts — primary action button. */
    continue: "Continue",
    /** matchEndHud.ts — section title below match result. */
    overallTitle: "Top 10 overall",
    /** matchEndHud.ts — loading text while API request runs. */
    overallLoading: "Loading overall leaderboard...",
    /** matchEndHud.ts — API failed or timed out. */
    overallUnavailable: "Overall leaderboard unavailable right now.",
    /** matchEndHud.ts — API succeeded but no stored rows yet. */
    overallEmpty: "No overall entries yet.",
    /** matchEndHud.ts — overall table header: wins total. */
    colOverallWins: "Wins",
    /** matchEndHud.ts — overall table header: played matches total. */
    colOverallMatches: "Matches",
  },

  /** sessionLoadBackdrop.ts + main.ts — full-screen art under lobby / load. */
  sessionLoad: {
    /** While scene and UI bootstrap before name dialog. */
    captionBoot: "Loading…",
    /** After name, while sounds/models load and room joins. */
    captionJoining: "Connecting…",
  },

  /** classPicker.ts — pre-match name entry overlay. */
  classPicker: {
    /** classPicker.ts — dialog `aria-label`. */
    ariaDialog: "Display name",
    /**
     * classPicker.ts — hint under title (FAC start).
     */
    hint: "Optional: enter a display name and continue. Everyone starts as FAC (fast attack craft).",
    /** classPicker.ts — label for name field. */
    nameCaption: "Enter Name",
    /** classPicker.ts — name input `placeholder`. */
    namePlaceholder: "e.g. Commander",
    /** classPicker.ts — submit button. */
    continue: "Continue",
  },

  /** missionBriefing.ts — pre-lobby narrative overlay. */
  missionBriefing: {
    /** missionBriefing.ts — dialog `aria-label`. */
    ariaDialog: "Mission briefing",
    /** missionBriefing.ts — header strip (classification). */
    headerClassified: "UNCLASSIFIED // OPER",
    /** missionBriefing.ts — header operation tag. */
    headerOp: "OPERATION: COLD-WAR-ARENA",
    /** missionBriefing.ts — main heading. */
    title: "Mission briefing",
    /**
     * missionBriefing.ts — lead paragraph before `<strong>` product name (`product.fullName`).
     */
    leadBefore: "You take the bridge of a various cold war warships in ",
    /** missionBriefing.ts — lead paragraph after product name. */
    leadAfter:
      ". Your objective is to take and hold the sea control area and engage hostile units.",
    /** missionBriefing.ts — “Situation” section title. */
    sectionSituationTitle: "Situation",
    /** missionBriefing.ts — situation body copy. */
    sectionSituationBody:
      "Open sea with islands. Use the tactical display to locate the objective and detect hostile contacts.",
    /** missionBriefing.ts — “Mission” section title. */
    sectionMissionTitle: "Mission",
    /** missionBriefing.ts — mission list item 1. */
    missionBullet1: "Establish Sea Control within the center of the islands.",
    /** missionBriefing.ts — mission list item 2. */
    missionBullet2: "Locate and engage all enemy units.",
    /** missionBriefing.ts — mission list item 3. */
    missionBullet3: "Hold the objective and survive engagements to get promoted.",
    /** missionBriefing.ts — map layout section title. */
    sectionMapTitle: "Arena layout",
    /** missionBriefing.ts — map bullet: central objective zone. */
    mapBulletSeaControl:
      "Sea Control Area: central square objective zone; passive score gain is multiplied while inside.",
    /** missionBriefing.ts — map bullet: arena edge / out-of-bounds behavior. */
    mapBulletOob:
      "OOB Boundary: Leaving the area of operation results in termination!",
    /** missionBriefing.ts — map bullet: islands as terrain constraints. */
    mapBulletIslands:
      "Islands: block movement and line of fire; use them for cover but avoid collision damage.",
    /** missionBriefing.ts — map bullet: portal reference marker. */
    mapBulletPortal:
      "Portal marker: Enter the ring to be deployed to other #VibeJam games.",
    /** missionBriefing.ts — map bullet: navigation orientation cue. */
    mapBulletNorth: "North arrow: use north-up orientation for callouts and maneuver coordination.",
    /** missionBriefing.ts — controls section title. */
    sectionControlsTitle: "Controls (quick)",
    /** missionBriefing.ts — text after `<kbd>WASD</kbd>` span. */
    controlWasdSuffix: "propulsion / rudder (hold; M toggles step mode)",
    /** missionBriefing.ts — text after `<kbd>Mouse</kbd>` span. */
    controlMouseSuffix: "aim line (fire direction)",
    /** missionBriefing.ts — text after LMB / Space spans (see template). */
    controlPrimarySuffix: "primary fire",
    /** missionBriefing.ts — text after `<kbd>RMB</kbd>` span. */
    controlRmbSuffix: "SSM by aim (hold toward fire-control target)",
    /** missionBriefing.ts — text after `<kbd>Q</kbd>` / `<kbd>E</kbd>` spans. */
    controlSsmQeSuffix: "SSM fixed rail — port / starboard (hold)",
    /** missionBriefing.ts — text after `<kbd>T</kbd>` / MMB spans (only when mines feature is on). */
    controlMinesTeSuffix: "mine lay (hold; middle mouse also)",
    /** missionBriefing.ts — text after `<kbd>R</kbd>` span. */
    controlRadarSuffix: "search radar on/off",
    /** missionBriefing.ts — text after `<kbd>F</kbd>` span (fire-control channel). */
    controlFireControlSuffix:
      "fire-control channel: cycle the designated hostile in range, or click an enemy hull to lock; primary / SSM fire toward that target when valid",
    /** missionBriefing.ts — ship classes & progression ranks. */
    sectionShipsTitle: "Ship classes & progression",
    /**
     * missionBriefing.ts — FAC line; `{rank}` = minimum naval rank (level 1), from `progressionNavalRankEn(1)`.
     */
    shipBulletFac:
      "FAC (fast attack craft): fastest and most agile; lighter hull and a smaller anti-ship missile magazine. From progression level 1 — {rank}.",
    /**
     * missionBriefing.ts — destroyer line; `{rank}` = rank at level 3 unlock (`progressionNavalRankEn(3)`).
     */
    shipBulletDestroyer:
      "Destroyer: balanced naval gun, torpedo, and SSM fit — the all-round workhorse. Unlocks at progression level 3 — {rank}.",
    /**
     * missionBriefing.ts — cruiser line; `{rank}` = rank at level 5 unlock (`progressionNavalRankEn(5)`).
     */
    shipBulletCruiser:
      "Cruiser: heaviest hull and largest SSM battery; slower turn and lower cruise speed. Unlocks at progression level 5 — {rank}.",
    /** missionBriefing.ts — dismiss button. */
    continue: "Understood — continue",
  },

  /** mobileControls.ts — touch / coarse-pointer action overlay. */
  mobile: {
    /** mobileControls.ts — root overlay `aria-label`. */
    ariaRoot: "Touch controls",
    /** mobileControls.ts — primary fire hold button. */
    btnFire: "FIRE",
    /** mobileControls.ts — port SSM hold button. */
    btnSsmPort: "Port SSM",
    /** mobileControls.ts — starboard SSM hold button. */
    btnSsmStarboard: "Stbd SSM",
    /** mobileControls.ts — tap: next fire-control target (same as key F). */
    btnNextFireControl: "NEXT TGT",
    /** mobileControls.ts — `aria-label` for next fire-control target button. */
    ariaNextFireControl: "Cycle next fire-control target (key F)",
  },

  /** hudRuntime.ts — dev-only lines on the debug overlay. */
  debugHud: {
    /**
     * hudRuntime.ts — suffix on `diag` after state keys (global on `window` after bootstrap).
     */
    consoleHint: "Console → window.__SCA",
    /**
     * hudRuntime.ts — red `warn` when `stateSyncCount === 0` several seconds after join.
     */
    warnNoRoomStateSync:
      "No ROOM_STATE (sync 0): WebSocket ACK? Check the server terminal. In the console, use the Warnings filter.",
    /**
     * hudRuntime.ts — red `warn` when sync runs but `playerList` stays empty.
     */
    warnPlayerListEmpty:
      "Sync OK but player list empty: check server onJoin logs, or try a second browser tab.",
    /**
     * hudRuntime.ts — red `warn` when player count stays zero while waiting for sync.
     */
    warnZeroPlayersWaiting:
      "Zero players: sync pending or missing — see gray diagnostics and the server terminal.",
  },

  hud: {
    /** cockpitHud.ts — root `aria-label` on `.cockpit-hud-root`. */
    ariaRoot: "Bridge and CIC",
    /** cockpitHud.ts — bridge column `aria-label`. */
    ariaBridge: "Bridge",
    /** cockpitHud.ts — OPZ column `aria-label`. */
    ariaOpz: "CIC",
    /** cockpitHud.ts — minimal bridge row label. */
    labelCourse: "CRS",
    /** cockpitHud.ts — readout row. */
    labelName: "Name",
    /** cockpitHud.ts — readout row. */
    labelClass: "Class",
    /** cockpitHud.ts — readout row (speed). */
    labelSpeed: "SOG",
    /** cockpitHud.ts — readout row (heading). */
    labelCourseFull: "CRS",
    /** cockpitHud.ts — progression rank row. */
    labelRank: "Rank",
    /** cockpitHud.ts — XP row. */
    labelXp: "XP",
    /** cockpitHud.ts — life/respawn row. */
    labelStatus: "Status",
    /** cockpitHud.ts — match timer row. */
    labelMatch: "Match",
    /** cockpitHud.ts — score row. */
    labelScore: "Score",
    /** cockpitHud.ts — radar block title. */
    radarTitle: "TACTICAL",
    /** cockpitHud.ts — radar cardinal. */
    radarNorth: "N",
    /** cockpitHud.ts — radar footer hint. */
    radarEsmHint: "ESM",
    /** cockpitHud.ts — map center marker `title` on SVG group. */
    radarMapCenterTitle: "Map center (0,0)",
    /** cockpitHud.ts — HP bar row. */
    labelHp: "HP",
    /** cockpitHud.ts — weapons subhead. */
    subheadWeapons: "Weapons",
    /** cockpitHud.ts — single ASuM load row label. */
    labelAswmLoad: "Anti Ship Missiles Load:",
    /** cockpitHud.ts — primary weapon cooldown row. */
    labelPrimary: "Main",
    /** cockpitHud.ts — ASuM row label. */
    labelAswm: "SSM",
    /** cockpitHud.ts — port magazine column header. */
    aswmPortShort: "BB",
    /** cockpitHud.ts — starboard magazine column header. */
    aswmStarboardShort: "STB",
    /** cockpitHud.ts — port column `aria-label`. */
    ariaAswmPort: "SSM port",
    /** cockpitHud.ts — starboard column `aria-label`. */
    ariaAswmStarboard: "SSM starboard",
    /** cockpitHud.ts — mines/torpedo row (when mines enabled). */
    labelMines: "Mines",
    /** cockpitHud.ts — ship topology schematic subhead. */
    subheadTopology: "Topology",
    /** cockpitHud.ts — own radar button `title`. */
    radarToggleTitle: "Search radar on/off (R key)",
    /** cockpitHud.ts — own radar button `aria-label`. */
    radarToggleAria: "Toggle search radar",
    /** cockpitHud.ts — `update()` primary/secondary ready state. */
    weaponReady: "ready",
    /** cockpitHud.ts — `update()` mine capacity full. */
    minesMax: "MAX",
    /** cockpitHud.ts — `update()` respawn countdown; `{seconds}` formatted (e.g. "12.3"). */
    statusRespawnIn: "Respawn in {seconds} s",
    /** cockpitHud.ts — `update()` spawn protection; `{seconds}` formatted. */
    statusSpawnProtection: "Spawn protection {seconds} s",
    /** cockpitHud.ts — `update()` placeholder em dash. */
    emDash: "—",
    /** cockpitHud.ts — `update()` radar search on. */
    radarOn: "RADAR ON",
    /** cockpitHud.ts — `update()` radar search off. */
    radarOff: "RADAR OFF",
    /** cockpitHud.ts — speed unit suffix (innerHTML next to speed value). */
    speedUnitKn: " kn",
    /** cockpitHud.ts — radar range footer; `{m}` = world meters (see RADAR_RANGE_WORLD). */
    radarRangeMeters: "{m}m",
    /** frameRuntime.ts — XP line when at max progression level (cockpit `xpLine`). */
    xpMax: "MAX",
    /** frameRuntime.ts — XP progress `xpLine`; `{current}`, `{need}` = segment XP. */
    xpProgress: "{current} / {need}",
  },

  /** machineryTelegraphLevers.ts — engine-order / rudder repeater chrome. */
  telegraphLevers: {
    /** Group `aria-label`. */
    ariaGroup: "Engine order and rudder repeaters",
    /** Vertical track `aria-label`. */
    ariaThrottle: "Ordered speed — full astern to full ahead",
    /** Horizontal track `aria-label`. */
    ariaRudder: "Ordered rudder — port to starboard",
    /** Seven labels stern → bow (matches `telegraphSteps` indices 0…6). */
    throttleTick0: "A/F",
    throttleTick1: "A 2/3",
    throttleTick2: "A 1/3",
    throttleTick3: "STOP",
    throttleTick4: "F 1/3",
    throttleTick5: "F 2/3",
    throttleTick6: "F/F",
    /** Seven labels port → starboard. */
    rudderTick0: "Bb F",
    rudderTick1: "Bb 2/3",
    rudderTick2: "Bb 1/3",
    rudderTick3: "MID",
    rudderTick4: "St 1/3",
    rudderTick5: "St 2/3",
    rudderTick6: "St F",
    /** keyboardMouse.ts — desktop keyboard control mode button. */
    controlModeHold: "Keys: HOLD",
    /** keyboardMouse.ts — desktop keyboard control mode button. */
    controlModeStep: "Keys: STEP",
    /** keyboardMouse.ts — desktop keyboard control mode button title. */
    controlModeToggleTitle: "Toggle W/A/S/D between hold-to-steer and stepwise telegraph mode (M key)",
    /** keyboardMouse.ts — desktop keyboard control mode button aria-label. */
    controlModeToggleAria: "Toggle keyboard control mode",
  },
} as const;
