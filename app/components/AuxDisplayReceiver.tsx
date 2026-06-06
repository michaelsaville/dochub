"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAuxEnabled, useAuxRole, otherRole, castCurrentView } from "@/lib/aux-display-client"

/**
 * Aux-display receiver — works for both screen roles.
 *
 * Opt-in (persisted in localStorage). When armed, this browser holds an SSE
 * connection to /api/aux-display/stream?role=<role> keyed by the signed-in
 * user's email, and navigates on events targeted at its role:
 *   - role "ipad"    follows ticket-opens from TicketHub (the second screen)
 *   - role "desktop" follows casts pushed from the iPad (the main screen)
 *
 * The bottom-left pill is the control surface: tap to arm/disarm. When armed,
 * a second button casts THIS browser's current view to the other screen.
 *
 * Mounted globally in AppShell; renders nothing visible until armed.
 */

type Status = "off" | "connecting" | "armed" | "error"

export default function AuxDisplayReceiver() {
  const { status: authStatus } = useSession()
  const router = useRouter()

  // Shared flags — kept in sync with the /aux-display control page.
  const [enabled, setEnabled] = useAuxEnabled()
  const [role] = useAuxRole()
  const [status, setStatus] = useState<Status>("off")
  const [lastTarget, setLastTarget] = useState<string | null>(null)
  const [castMsg, setCastMsg] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const castTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggle = useCallback(() => {
    setEnabled(!enabled)
  }, [enabled, setEnabled])

  const flashCast = useCallback((msg: string) => {
    setCastMsg(msg)
    if (castTimer.current) clearTimeout(castTimer.current)
    castTimer.current = setTimeout(() => setCastMsg(null), 2600)
  }, [])

  const cast = useCallback(async () => {
    const target = otherRole(role)
    const targetName = target === "desktop" ? "desktop" : "iPad"
    const delivered = await castCurrentView(role)
    if (delivered === null) flashCast("Couldn’t send")
    else if (delivered === 0) flashCast(`No ${targetName} connected`)
    else flashCast(`Sent to ${targetName} ✓`)
  }, [role, flashCast])

  // Open / close the SSE connection in step with `enabled`, auth, and role.
  useEffect(() => {
    if (!enabled || authStatus !== "authenticated") {
      esRef.current?.close()
      esRef.current = null
      setStatus(enabled ? "connecting" : "off")
      return
    }

    setStatus("connecting")
    const es = new EventSource(`/api/aux-display/stream?role=${role}`)
    esRef.current = es

    es.onopen = () => setStatus("armed")
    es.onerror = () => {
      // EventSource auto-reconnects; reflect the gap without tearing down.
      setStatus("connecting")
    }
    es.onmessage = (e) => {
      let data: {
        type?: string
        url?: string | null
        label?: string | null
        clientName?: string | null
        source?: string | null
      }
      try {
        data = JSON.parse(e.data)
      } catch {
        return
      }
      if (data.type === "connected") {
        setStatus("armed")
        return
      }
      if (data.type === "navigate" && data.url) {
        const via = data.source === "cast" ? "Cast" : "Following"
        setLastTarget(`${via} → ${data.label || data.clientName || "view"}`)
        router.push(data.url)
        return
      }
      if (data.type === "notfound") {
        setLastTarget(`No DocHub record for ${data.clientName ?? "client"}`)
      }
    }

    return () => {
      es.close()
      if (esRef.current === es) esRef.current = null
    }
  }, [enabled, authStatus, role, router])

  const palette: Record<Status, { bg: string; dot: string; text: string }> = {
    off: { bg: "rgba(100,116,139,0.12)", dot: "#64748b", text: "var(--muted)" },
    connecting: { bg: "rgba(245,158,11,0.12)", dot: "#f59e0b", text: "#f59e0b" },
    armed: { bg: "rgba(34,197,94,0.12)", dot: "#22c55e", text: "#22c55e" },
    error: { bg: "rgba(239,68,68,0.12)", dot: "#ef4444", text: "#ef4444" },
  }
  const p = palette[status]

  const roleIcon = role === "desktop" ? "🖥️" : "📲"
  const roleWord = role === "desktop" ? "Main screen" : "Aux Display"
  const labelText =
    status === "armed"
      ? castMsg ?? lastTarget ?? `${roleWord} • waiting`
      : status === "connecting"
        ? `${roleWord} • connecting…`
        : `${roleWord} • off`

  const showCast = enabled && authStatus === "authenticated"
  const castTo = otherRole(role) === "desktop" ? "desktop" : "iPad"
  const castIcon = otherRole(role) === "desktop" ? "🖥️" : "📲"

  return (
    <div
      style={{
        position: "fixed",
        left: "14px",
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 35,
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <button
        onClick={toggle}
        title={
          enabled
            ? `${roleWord} is ON. Tap to turn off.`
            : "Arm this screen for the TicketHub aux-display link. Tap to arm."
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "999px",
          border: "0.5px solid var(--color-border-tertiary)",
          background: p.bg,
          color: p.text,
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          opacity: enabled ? 1 : 0.55,
          transition: "opacity 0.15s, background 0.15s, color 0.15s",
        }}
      >
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: p.dot,
            boxShadow: status === "armed" ? `0 0 6px ${p.dot}` : "none",
            flexShrink: 0,
          }}
        />
        <span>
          {roleIcon} {labelText}
        </span>
      </button>

      {showCast && (
        <button
          onClick={cast}
          title={`Show this page on the ${castTo}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-secondary)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          }}
        >
          <span>{castIcon}</span>
          <span>Send to {castTo}</span>
        </button>
      )}
    </div>
  )
}
