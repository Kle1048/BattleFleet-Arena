import { FEATURE_MINES_ENABLED } from "@battlefleet/shared/rules";
import { t } from "../../locale/t";

/** Shared static copy keeps the full guide and in-game reference in sync. */
export function controlGuideHtml(compact = false, mobile = false): string {
  const groups = mobile ? [
    { title: t("playHelp.movement"), rows: [
      [t("playHelp.throttleLever"), t("playHelp.throttle")],
      [t("playHelp.rudderLever"), t("playHelp.rudder")],
    ] },
    { title: t("playHelp.combat"), rows: [
      ["Tap", t("playHelp.mobileAim")],
      ["Assign Fire Control Channel", t("playHelp.cycle")], ["Break FC", t("playHelp.clear")],
      ["Fire Gun", t("playHelp.gun")], ["Autofire OFF / ON", t("playHelp.autofire")],
      ["Fire port SSM / Fire Stbd SSM", t("playHelp.rails")],
    ] },
    { title: t("playHelp.systems"), rows: [["RADAR", t("playHelp.radar")], ["⛶", t("playHelp.mobileFullscreen")]] },
  ] : [
    { title: t("playHelp.movement"), rows: [
      ["W / S", t("playHelp.throttle")], ["A / D", t("playHelp.rudder")], ["M", t("playHelp.mode")],
    ] },
    { title: t("playHelp.combat"), rows: [
      ...(!compact ? [[t("playHelp.mouse"), t("playHelp.aim")]] : []),
      ["F", t("playHelp.cycle")], ["R", t("playHelp.radar")], ["Caps Lock", t("playHelp.autofire")], ["C / Esc", t("playHelp.clear")],
      [t("playHelp.leftMouse"), t("playHelp.gun")], [t("playHelp.rightMouse"), t("playHelp.missile")],
      ["Q / E", t("playHelp.rails")], ["Tab", t("playHelp.sectors")],
      ...(!compact ? [["Mouse wheel", t("playHelp.zoom")]] : []),
      ...(FEATURE_MINES_ENABLED ? [["T / MMB", t("missionBriefing.controlMinesTeSuffix")]] : []),
    ] },
    ...(!compact ? [{ title: t("playHelp.systems"), rows: [
      ["RADAR", t("playHelp.radar")], ["⛶", t("playHelp.fullscreen")],
    ] }] : []),
  ];
  return groups.map(group => `<section class="control-guide-group"><h3>${group.title}</h3><dl>${group.rows.map(([key, label]) =>
    `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join("")}</dl></section>`).join("");
}
