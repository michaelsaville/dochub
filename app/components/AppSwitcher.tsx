/**
 * Jump between PCC2K apps — same 2×2 switcher as TicketHub's sidebar
 * (DocHub / TicketHub / Breeze / Scout), with the current app highlighted.
 */
const APPS = [
  { key: "dochub", label: "DocHub", href: process.env.NEXT_PUBLIC_DOCHUB_URL || "https://dochub.pcc2k.com" },
  { key: "tickethub", label: "TicketHub", href: process.env.NEXT_PUBLIC_TICKETHUB_URL || "https://tickethub.pcc2k.com" },
  { key: "breeze", label: "Breeze", href: process.env.NEXT_PUBLIC_BREEZE_URL || "https://breeze.pcc2k.com" },
  { key: "scout", label: "Scout", href: process.env.NEXT_PUBLIC_SCOUT_URL || "https://scout-api.pcc2k.com" },
] as const

const pill: React.CSSProperties = {
  display: "block", padding: "6px 8px", borderRadius: "6px", textAlign: "center",
  fontSize: "12px", fontWeight: 500, fontFamily: "var(--sans)", textDecoration: "none",
  color: "var(--muted)", border: "0.5px solid transparent",
}
const activePill: React.CSSProperties = {
  ...pill, fontWeight: 600, color: "var(--accent)",
  background: "rgba(61,111,255,0.1)", border: "0.5px solid rgba(61,111,255,0.3)",
}

export default function AppSwitcher({ current = "dochub" }: { current?: (typeof APPS)[number]["key"] }) {
  return (
    <nav aria-label="Switch app" style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "10px 12px",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      {APPS.map((a) =>
        a.key === current ? (
          <span key={a.key} aria-current="page" style={activePill}>{a.label}</span>
        ) : (
          <a key={a.key} href={a.href} className="app-switcher-link" style={pill}>{a.label}</a>
        ),
      )}
    </nav>
  )
}
