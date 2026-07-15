"use client"

import { useEffect, useState } from "react"
import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"
import { useAuxEnabled, useAuxRole } from "@/lib/aux-display-client"

export default function AuxDisplayPage() {
  const { data: session, status: authStatus } = useSession()
  const [enabled, setEnabled] = useAuxEnabled()
  const [role, setRole] = useAuxRole()

  const email = session?.user?.email ?? null
  const isIpad = role === "ipad"

  // Kiosk wallboard launcher. The KIOSK_TOKEN is a server secret, so fetch the
  // tokened path from the SSO-gated /api/aux-display/kiosk-url (NOT /api/kiosk/*,
  // which is public) and build the absolute URL from the browser origin.
  const [kioskUrl, setKioskUrl] = useState<string | null>(null)
  const [kioskState, setKioskState] =
    useState<"loading" | "ready" | "unconfigured" | "error">("loading")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/aux-display/kiosk-url")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { configured?: boolean; path?: string }) => {
        if (cancelled) return
        if (d.configured && d.path) {
          setKioskUrl(window.location.origin + d.path)
          setKioskState("ready")
        } else {
          setKioskState("unconfigured")
        }
      })
      .catch(() => {
        if (!cancelled) setKioskState("error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const copyKiosk = () => {
    if (!kioskUrl) return
    navigator.clipboard.writeText(kioskUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 96px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>📲 Aux Display</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Turn this iPad into a context-aware second screen. When it&apos;s armed and
          you open a ticket in TicketHub, this screen automatically jumps to that
          customer&apos;s DocHub page — no searching.
        </p>

        {/* Device role */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>This device is the…</div>
          <div style={{ display: "flex", gap: 10 }}>
            <RolePick
              active={isIpad}
              icon="📲"
              title="Aux screen"
              sub="Follows your tickets"
              onClick={() => setRole("ipad")}
            />
            <RolePick
              active={!isIpad}
              icon="🖥️"
              title="Main screen"
              sub="Receives casts from the aux screen"
              onClick={() => setRole("desktop")}
            />
          </div>
        </div>

        {/* Arm / disarm card */}
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 14,
            background: "var(--color-background-secondary)",
            padding: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: enabled ? "#00d4aa" : "#64748b",
                  boxShadow: enabled ? "0 0 8px #00d4aa" : "none",
                }}
              />
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {enabled ? "Armed" : "Off"}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              {enabled
                ? isIpad
                  ? "Following your tickets. Open one in TicketHub to see it flip."
                  : "Listening for casts. Tap “Send to main screen” on the aux device."
                : `Arm this ${isIpad ? "aux screen" : "main screen"} to connect.`}
            </div>
          </div>

          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              flexShrink: 0,
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontSize: 15,
              fontWeight: 700,
              color: "#fff",
              background: enabled ? "#ff4d6d" : "#00d4aa",
              minWidth: 120,
            }}
          >
            {enabled ? "Disarm" : "Arm iPad"}
          </button>
        </div>

        {/* Pairing identity */}
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: 12,
            padding: "14px 16px",
            marginBottom: 28,
            fontSize: 13,
            color: "var(--color-text-secondary)",
          }}
        >
          {authStatus === "authenticated" ? (
            <>
              Paired to <strong>{email}</strong>. The link is automatic — open a
              ticket on any device signed in as this same account and it lands here.
              No codes.
            </>
          ) : (
            <>Sign in to pair this iPad to your account.</>
          )}
        </div>

        {/* Setup */}
        <Section title="First-time setup">
          <ol style={listStyle}>
            <li>
              In Safari on the iPad, open <code style={code}>dochub.pcc2k.com</code>,
              then Share → <strong>Add to Home Screen</strong> (gives you a full-screen app).
            </li>
            <li>Open it from the Home Screen and sign in with your Microsoft account.</li>
            <li>
              Come back to this page and tap <strong>Arm iPad</strong> above (or the
              📲 pill in the bottom-left corner).
            </li>
            <li>Open a ticket in TicketHub at your desk — this screen follows along.</li>
          </ol>
        </Section>

        {/* Cast back */}
        <Section title="Send a view to the other screen">
          <p style={para}>
            When armed, a <strong>Send to {isIpad ? "main screen" : "aux screen"}</strong>{" "}
            button sits next to the 📲 pill (bottom-left). Navigate to any client,
            asset, or document here, then tap it to make the {isIpad ? "desktop" : "iPad"}{" "}
            jump to the same page. For this to work the other screen must also be open
            on DocHub and armed (as the {isIpad ? "main screen" : "aux screen"}).
          </p>
        </Section>

        {/* Kiosk wallboard */}
        <Section title="Open the kiosk wallboard">
          <p style={{ ...para, marginBottom: 12 }}>
            A read-only, full-screen <strong>wallboard</strong> — live counts,
            active alarms, and upcoming expirations. It needs <em>no login</em>{" "}
            (ideal for a wall-mounted iPad), so the link carries a secret token —
            keep it private and don&apos;t post it publicly.
          </p>
          {kioskState === "ready" && kioskUrl && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  href={kioskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    background: "#3d6fff",
                    textDecoration: "none",
                  }}
                >
                  📺 Open wallboard
                </a>
                <button
                  onClick={copyKiosk}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "0.5px solid var(--color-border-secondary)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {copied ? "✓ Copied" : "Copy link"}
                </button>
              </div>
              <p style={{ ...para, marginTop: 12, color: "var(--muted)" }}>
                Bookmark it on the iPad (Share → Add to Home Screen) for a one-tap
                board, then lock it down with Guided Access below. Append{" "}
                <code style={code}>&amp;clientId=&lt;id&gt;</code> to scope the
                board to a single client.
              </p>
            </>
          )}
          {kioskState === "unconfigured" && (
            <p style={{ ...para, color: "var(--muted)" }}>
              Kiosk not configured — set <code style={code}>KIOSK_TOKEN</code> in
              the server <code style={code}>.env</code> and redeploy.
            </p>
          )}
          {kioskState === "loading" && (
            <p style={{ ...para, color: "var(--muted)" }}>Loading…</p>
          )}
          {kioskState === "error" && (
            <p style={{ ...para, color: "var(--muted)" }}>
              Couldn&apos;t load the kiosk link.
            </p>
          )}
        </Section>

        {/* Guided Access */}
        <Section title="Lock it to one app (Guided Access)">
          <p style={{ ...para, marginBottom: 10 }}>
            Guided Access keeps the iPad on DocHub only and prevents the screen from
            sleeping — ideal for a wall-mounted or counter display.
          </p>
          <ol style={listStyle}>
            <li>
              <strong>Settings → Accessibility → Guided Access</strong> → turn it on.
            </li>
            <li>
              Set a <strong>Passcode</strong> (Guided Access → Passcode Settings) so it
              can&apos;t be exited without you. Face ID / Touch ID optional.
            </li>
            <li>
              Open the DocHub home-screen app, then <strong>triple-click</strong> the
              side/top button → <strong>Start</strong>.
            </li>
            <li>
              In the Guided Access options (bottom-left <em>Options</em> before starting):
              keep <strong>Touch</strong> on, turn <strong>Sleep/Wake</strong> off, and
              set a <strong>Time Limit</strong> of none.
            </li>
            <li>
              To exit later: triple-click the button and enter the passcode → <strong>End</strong>.
            </li>
          </ol>
          <p style={{ ...para, marginTop: 12, color: "var(--muted)" }}>
            Also set <strong>Settings → Display &amp; Brightness → Auto-Lock → Never</strong>{" "}
            while the iPad is on power, so it stays awake between tickets. For a fleet of
            iPads, an MDM kiosk profile does all of this centrally.
          </p>
        </Section>
      </div>
    </AppShell>
  )
}

function RolePick({
  active,
  icon,
  title,
  sub,
  onClick,
}: {
  active: boolean
  icon: string
  title: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        cursor: "pointer",
        border: active
          ? "1px solid #3d6fff"
          : "0.5px solid var(--color-border-tertiary)",
        background: active ? "rgba(59,130,246,0.10)" : "var(--color-background-secondary)",
        color: "var(--color-text-secondary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        {title}
        {active && <span style={{ marginLeft: "auto", color: "#3d6fff", fontSize: 12 }}>✓</span>}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>{sub}</div>
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      {children}
    </div>
  )
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--color-text-secondary)",
}

const para: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--color-text-secondary)",
  margin: 0,
}

const code: React.CSSProperties = {
  background: "var(--color-background-tertiary, rgba(255,255,255,0.06))",
  padding: "1px 6px",
  borderRadius: 5,
  fontSize: 13,
}
