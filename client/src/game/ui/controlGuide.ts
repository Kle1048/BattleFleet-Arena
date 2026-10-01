import { FEATURE_MINES_ENABLED } from "@battlefleet/shared/rules";
import { t } from "../../locale/t";

/** Shared static copy keeps the full guide and in-game reference in sync. */
export function controlGuideHtml(compact = false): string {
  const groups = [
    { title: t("playHelp.movement"), rows: [
      ["W / S", t("playHelp.throttle")], ["A / D", t("playHelp.rudder")], ["M", t("playHelp.mode")],
    ] },
    { title: t("playHelp.combat"), rows: [
      ...(!compact ? [[t("playHelp.mouse"), t("playHelp.aim")]] : []),
      ["F", t("playHelp.nearest")], ["R", t("playHelp.cycle")], ["C", t("playHelp.clear")],
      [t("playHelp.leftMouse"), t("playHelp.gun")], [t("playHelp.rightMouse"), t("playHelp.missile")],
      ["Q / E", t("playHelp.rails")],
      ...(FEATURE_MINES_ENABLED ? [["T / MMB", t("missionBriefing.controlMinesTeSuffix")]] : []),
    ] },
    ...(!compact ? [{ title: t("playHelp.systems"), rows: [
      ["RADAR", t("playHelp.radar")], ["⛶", t("playHelp.fullscreen")],
    ] }] : []),
  ];
  return groups.map(group => `<section class="control-guide-group"><h3>${group.title}</h3><dl>${group.rows.map(([key, label]) =>
    `<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join("")}</dl></section>`).join("");
}
