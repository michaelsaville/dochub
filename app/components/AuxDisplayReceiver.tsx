"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAuxEnabled } from "@/lib/aux-display-client"

/**
 * iPad "aux display" receiver.
 *
 * Opt-in (persisted in localStorage). When ON, the iPad holds an SSE
 * connection to /api/aux-display/stream keyed by the signed-in user's email.
 * When that user opens a ticket in TicketHub, this flips the iPad to the
 * matching client's DocHub page automatically. The pill (bottom-left) is the
 * whole control surface — tap to arm/disarm; it shows live status.
 *
 * Mounted globally in AppShell; renders nothing visible until armed, so it's
 * invisible on a normal desktop session.
 */

type Status = "off" | "connecting" | "armed" | "error"

export default function AuxDisplayReceiver() {
  const { status: authStatus } = useSession()
  const router = useRouter()

  // Shared armed flag — kept in sync with the /aux-display control page.
  const [enabled, setEnabled] = useAuxEnabled()
  const [status, setStatus] = useState<Status>("off")
  const [lastTarget, setLastTarget] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const toggle = useCallback(() => {
    setEnabled(!enabled)
  }, [enabled, setEnabled])

  // Open / close the SSE connection in step with `enabled` + auth.
  useEffect(() => {
    if (!enabled || authStatus !== "authenticated") {
      esRef.current?.close()
      esRef.current = null
      setStatus(enabled ? "connecting" : "off")
      return
    }

    setStatus("connecting")
    const es = new EventSource("/api/aux-display/stream")
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
        setLastTarget(data.label || data.clientName || "client")
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
  }, [enabled, authStatus, router])

  const palette: Record<Status, { bg: string; dot: string; text: string }> = {
    off: { bg: "rgba(100,116,139,0.12)", dot: "#64748b", text: "var(--muted)" },
    connecting: { bg: "rgba(245,158,11,0.12)", dot: "#f59e0b", text: "#f59e0b" },
    armed: { bg: "rgba(34,197,94,0.12)", dot: "#22c55e", text: "#22c55e" },
    error: { bg: "rgba(239,68,68,0.12)", dot: "#ef4444", text: "#ef4444" },
  }
  const p = palette[status]

  const labelText =
    status === "armed"
      ? lastTarget
        ? `Following → ${lastTarget}`
        : "Aux Display • waiting"
      : status === "connecting"
        ? "Aux Display • connecting…"
        : "Aux Display • off"

  return (
    <button
      onClick={toggle}
      title={
        enabled
          ? "Aux Display is ON — opening a ticket in TicketHub flips this screen to that client. Tap to turn off."
          : "Turn this iPad into a context-aware second screen for TicketHub. Tap to arm."
      }
      style={{
        position: "fixed",
        left: "14px",
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        zIndex: 35,
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
      <span>📲 {labelText}</span>
    </button>
  )
}
