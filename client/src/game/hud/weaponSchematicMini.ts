import type {
  FixedSeaSkimmerLauncherSpec,
  MountSlotDefinition,
  ShipHullVisualProfile,
} from "@battlefleet/shared";

const svgNs = "http://www.w3.org/2000/svg";

/**
 * Nur für die **Mini-Draufsicht** (Farbe des Punktes + ggf. Train-Strich).
 * Entspricht den Slot-`defaultVisualId`-Strings aus `defaultLoadout` / Profil-JSON —
 * dieselben Keys wie in `mountGltfUrls.ts` (`MOUNT_VISUAL_GLB_BY_ID`).
 */
type MountKind = "artillery" | "ciws" | "sam" | "pd" | "torpedo" | "ssm" | "generic";

/** Vorgabe-Farbe pro eingetragenem Standard-Visual (explizit, keine Heuristik). */
const SCHEMATIC_KIND_BY_DEFAULT_VISUAL_ID: Partial<Record<string, MountKind>> = {
  visual_artillery: "artillery",
  visual_ciws: "ciws",
  visual_sam: "sam",
  /** PDMS — AD-Hardkill-Schicht PD (nicht CIWS, eigene Farbe `--pd`). */
  visual_pdms: "pd",
  visual_torpedo: "torpedo",
};

function classifyFromSlot(s: MountSlotDefinition, loadout: Record<string, string> | undefined): MountKind {
  const vid = (loadout?.[s.id] ?? s.defaultVisualId ?? "").trim();
  const fromPreset = SCHEMATIC_KIND_BY_DEFAULT_VISUAL_ID[vid];
  if (fromPreset) return fromPreset;

  /** Kein `defaultVisualId` in der JSON-Vorgabe: grobe Zuordnung über `compatibleKinds`. */
  const kinds = s.compatibleKinds;
  if (kinds.includes("artillery")) return "artillery";
  if (kinds.includes("ciws")) return "ciws";
  if (kinds.includes("pdms")) return "pd";
  if (kinds.includes("sam_launcher")) return "sam";
  if (vid.includes("torpedo")) return "torpedo";
  if (vid.includes("ssm")) return "ssm";
  return "generic";
}

function kindClass(k: MountKind): string {
  switch (k) {
    case "artillery":
      return "cockpit-schematic-mount--arty";
    case "ciws":
      return "cockpit-schematic-mount--ciws";
    case "sam":
      return "cockpit-schematic-mount--sam";
    case "pd":
      return "cockpit-schematic-mount--pd";
    case "torpedo":
      return "cockpit-schematic-mount--torp";
    case "ssm":
      return "cockpit-schematic-mount--ssm";
    default:
      return "cockpit-schematic-mount--gen";
  }
}

/**
 * Baut / aktualisiert die schematische Draufsicht (Bug = oben, +X Steuerbord rechts).
 */
export function renderWeaponSchematic(
  host: HTMLElement,
  profile: ShipHullVisualProfile | undefined,
  mainTrainRad: number,
): void {
  host.replaceChildren();
  if (!profile) return;

  const loadout = profile.defaultLoadout;

  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "-52 -58 104 116");
  svg.setAttribute("class", "cockpit-schematic-svg");
  svg.setAttribute("aria-hidden", "true");

  const xs: number[] = [];
  const zs: number[] = [];
  for (const s of profile.mountSlots ?? []) {
    xs.push(s.socket.position.x);
    zs.push(s.socket.position.z);
  }
  for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
    xs.push(L.socket.position.x);
    zs.push(L.socket.position.z);
  }
  if (xs.length === 0) {
    host.appendChild(svg);
    return;
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const midX = (minX + maxX) / 2;
  const pad = 6;
  const rx = Math.max(maxX - minX, 4) + pad * 2;
  const rz = Math.max(maxZ - minZ, 8) + pad * 2;
  const scale = 78 / Math.max(rx, rz);

  const hull = document.createElementNS(svgNs, "path");
  hull.setAttribute("class", "cockpit-schematic-hull");
  const bw = (maxX - minX) * 0.38 * scale + 8;
  /** Bug = +Z → oben (negatives SVG-y). */
  const tipY = -maxZ * scale - 6;
  const sternY = -minZ * scale + 8;
  hull.setAttribute("d", `M 0 ${tipY} L ${bw} ${sternY} L ${-bw} ${sternY} Z`);
  svg.appendChild(hull);

  for (const s of profile.mountSlots ?? []) {
    const k = classifyFromSlot(s, loadout);
    const mx = (s.socket.position.x - midX) * scale;
    const my = -s.socket.position.z * scale;
    const g = document.createElementNS(svgNs, "g");
    g.setAttribute("transform", `translate(${mx},${my})`);
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("class", `cockpit-schematic-mount ${kindClass(k)}`);
    g.appendChild(dot);

    const kinds = s.compatibleKinds;
    const rotating =
      kinds.includes("artillery") ||
      kinds.includes("ciws") ||
      kinds.includes("sam_launcher") ||
      kinds.includes("pdms");
    if (rotating) {
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("class", "cockpit-schematic-train");
      const L = 18;
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", String(Math.sin(mainTrainRad) * L));
      line.setAttribute("y2", String(-Math.cos(mainTrainRad) * L));
      g.appendChild(line);
    }
    svg.appendChild(g);
  }

  for (const L of profile.fixedSeaSkimmerLaunchers ?? []) {
    const mx = (L.socket.position.x - midX) * scale;
    const my = -L.socket.position.z * scale;
    const g = document.createElementNS(svgNs, "g");
    g.setAttribute("transform", `translate(${mx},${my})`);
    const yaw = launcherYawFromSpec(L);
    const dot = document.createElementNS(svgNs, "circle");
    dot.setAttribute("r", "3.5");
    dot.setAttribute("class", "cockpit-schematic-mount cockpit-schematic-mount--ssm");
    g.appendChild(dot);
    const tick = document.createElementNS(svgNs, "line");
    tick.setAttribute("class", "cockpit-schematic-fixed");
    const len = 12;
    tick.setAttribute("x1", "0");
    tick.setAttribute("y1", "0");
    tick.setAttribute("x2", String(Math.sin(yaw) * len));
    tick.setAttribute("y2", String(-Math.cos(yaw) * len));
    g.appendChild(tick);
    svg.appendChild(g);
  }

  host.appendChild(svg);
}

function launcherYawFromSpec(L: FixedSeaSkimmerLauncherSpec): number {
  return typeof L.launchYawRadFromBow === "number"
    ? L.launchYawRadFromBow
    : 0;
}
