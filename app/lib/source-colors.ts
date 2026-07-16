// Canonical brand/source colors + domains for external data sources.
//
// Single source of truth — imported by clients/[id], licenses, settings, and the
// source-colors API so the same vendor never renders a different color on two
// pages. HEX only: the /api/settings/source-colors PATCH validates
// /^#[0-9a-fA-F]{6}$/, so SYNCRO/PAX8 use the --accent/--accent2 hex values
// (#3d6fff / #00d4aa) rather than CSS var() strings — same rendered color, but
// valid to persist and consistent everywhere.
export const SOURCE_DEFAULTS: Record<string, string> = {
  SYNCRO:      "#3d6fff", // = --accent
  UNIFI:       "#8b5cf6",
  ITFLOW:      "#f97316",
  PAX8:        "#00d4aa", // = --accent2
  PULSEWAY:    "#ec4899",
  MERAKI:      "#00bceb",
  HPINSTANTON: "#0096d6",
  SONICWALL:   "#e8521a",
  SCOUT:       "#14b8a6",
}

export const SOURCE_DOMAINS: Record<string, string> = {
  SYNCRO:      "syncromsp.com",
  UNIFI:       "ui.com",
  ITFLOW:      "itflow.org",
  PAX8:        "pax8.com",
  PULSEWAY:    "pulseway.com",
  MERAKI:      "meraki.cisco.com",
  HPINSTANTON: "arubainstanton.com",
  SONICWALL:   "sonicwall.com",
}
