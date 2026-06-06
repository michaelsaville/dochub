"use client"

import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"
import { useAuxEnabled } from "@/lib/aux-display-client"

export default function AuxDisplayPage() {
  const { data: session, status: authStatus } = useSession()
  const [enabled, setEnabled] = useAuxEnabled()

  const email = session?.user?.email ?? null

  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px 96px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>📲 Aux Display</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
          Turn this iPad into a context-aware second screen. When it&apos;s armed and
          you open a ticket in TicketHub, this screen automatically jumps to that
          customer&apos;s DocHub page — no searching.
        </p>

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
                  background: enabled ? "#22c55e" : "#64748b",
                  boxShadow: enabled ? "0 0 8px #22c55e" : "none",
                }}
              />
              <span style={{ fontSize: 16, fontWeight: 600 }}>
                {enabled ? "Armed" : "Off"}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
              {enabled
                ? "Following your tickets. Open one in TicketHub to see it flip."
                : "Arm this iPad to start following your tickets."}
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
              background: enabled ? "#ef4444" : "#22c55e",
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
