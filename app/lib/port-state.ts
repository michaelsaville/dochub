/**
 * How a port looks, in one place.
 *
 * Promoted out of SwitchPanel.tsx, where fill carried BOTH "in use" and "which
 * VLAN" — which is exactly why that component could never render "cabled but not
 * patched", the state the whole keystone metaphor depends on. Here the channels
 * are separated:
 *
 *     fill  = connection state   (what is plugged in)
 *     ring  = VLAN               (which network)
 *     glyph = PoE / uplink       (what is special about it)
 *
 * Fills come from paired CSS tokens that invert under @media print, because port
 * state IS the deliverable on a printed as-built and must survive on white paper.
 * A hatch pattern backs up the "empty" state so it also survives greyscale and
 * colour-blindness — never rely on hue alone for a state a technician acts on.
 */

export type PortState =
  | "EMPTY"        // no keystone, no cord — nothing has ever been connected
  | "CABLED"       // a BUILDING link lands here: the keystone exists, nothing patched
  | "PATCHED"      // a PATCH cord is plugged in
  | "IN_USE"       // patched AND a device is known to be on the other end
  | "UPLINK"       // trunk / uplink

export type PortView = {
  state: PortState
  vlanColor?: string | null
  isPoe?: boolean
}

export const PORT_STATE_LABEL: Record<PortState, string> = {
  EMPTY: "Empty",
  CABLED: "Cabled, not patched",
  PATCHED: "Patched",
  IN_USE: "In use",
  UPLINK: "Uplink",
}

/** Fill token per state. Values live in globals.css and invert under @media print. */
export function portFill(state: PortState): string {
  switch (state) {
    case "IN_USE":
    case "PATCHED":
      return "var(--color-fill-inuse)"
    case "UPLINK":
      return "var(--color-fill-uplink)"
    case "CABLED":
      // Deliberately distinct from both empty and in-use: this is the state that
      // says "the cable is in the wall, you just haven't plugged it in".
      return "var(--color-fill-cabled)"
    default:
      return "var(--color-fill-empty)"
  }
}

export function portText(state: PortState): string {
  switch (state) {
    case "IN_USE":
    case "PATCHED":
      return "var(--color-on-inuse)"
    case "UPLINK":
      return "var(--color-on-uplink)"
    case "CABLED":
      return "var(--color-on-cabled)"
    default:
      return "var(--color-on-empty)"
  }
}

/** SVG pattern id for states that must read without colour. */
export function portPattern(state: PortState): string | null {
  return state === "EMPTY" ? "url(#hatch-empty)" : null
}

/**
 * Device category -> hue, for rack elevations.
 * Categorical, so raw hex: the theme ships four semantic colours and cannot encode
 * a dozen device classes. Pair with the 2-letter glyph below for monochrome print.
 */
export const DEVICE_COLORS: Record<string, string> = {
  // AssetCategory members (what Asset.category actually holds) MUST be present.
  // These maps were keyed only on the legacy NetworkDeviceType names, so on the
  // floor plan every NETWORK_GEAR / WIRELESS / PHONE_SYSTEM device fell through to
  // OTHER and rendered as an identical grey "--" dot — i.e. exactly the devices a
  // floor plan exists to locate, while 784 workstations rendered a legible "PC".
  NETWORK_GEAR: "#3b82f6",
  WIRELESS: "#8b5cf6",
  PHONE_SYSTEM: "#f43f5e",
  PHONE_ENDPOINT: "#fb7185",
  TABLET: "#22d3ee",
  VPN: "#a78bfa",
  WEBSITE: "#eab308",
  FIREWALL: "#ef4444",
  ROUTER: "#f97316",
  SWITCH: "#3b82f6",
  PATCH_PANEL: "#22c55e",
  ACCESS_POINT: "#8b5cf6",
  UPS: "#f59e0b",
  NAS: "#10b981",
  SERVER: "#0ea5e9",
  COMPUTER: "#14b8a6",
  LAPTOP: "#84cc16",
  PRINTER: "#ec4899",
  MODEM: "#6366f1",
  OTHER: "#64748b",
}

/** Two-letter mono badge — survives greyscale print where hue does not. */
export const DEVICE_GLYPH: Record<string, string> = {
  NETWORK_GEAR: "SW",
  WIRELESS: "AP",
  PHONE_SYSTEM: "PB",
  PHONE_ENDPOINT: "PH",
  TABLET: "TB",
  VPN: "VP",
  WEBSITE: "WW",
  FIREWALL: "FW",
  ROUTER: "RT",
  SWITCH: "SW",
  PATCH_PANEL: "PP",
  ACCESS_POINT: "AP",
  UPS: "UP",
  NAS: "NA",
  SERVER: "SR",
  COMPUTER: "PC",
  LAPTOP: "LP",
  PRINTER: "PR",
  MODEM: "MD",
  OTHER: "--",
}

export function deviceColor(kind: string | null | undefined): string {
  return DEVICE_COLORS[kind ?? "OTHER"] ?? DEVICE_COLORS.OTHER
}

export function deviceGlyph(kind: string | null | undefined): string {
  return DEVICE_GLYPH[kind ?? "OTHER"] ?? DEVICE_GLYPH.OTHER
}
