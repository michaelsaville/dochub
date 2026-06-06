"use client"

import { useCallback, useRef, useState } from "react"
import { useAuxEnabled, useAuxRole, otherRole, castUrl } from "@/lib/aux-display-client"

/**
 * Per-item "cast to the other screen" button.
 *
 * Drop next to any entity that has its own DocHub route (a client, location,
 * asset, …). Renders NOTHING unless this device is armed for aux-display, so
 * it stays invisible for everyone not using the second-screen feature.
 *
 * On tap it pushes `url` to the opposite screen in the user's room (iPad →
 * desktop, or desktop → iPad) without navigating this device.
 *
 *   <CastButton url={`/clients/${c.id}`} label={c.name} />
 */
export default function CastButton({
  url,
  label = null,
  size = 26,
  stopPropagation = true,
}: {
  url: string
  label?: string | null
  /** Square px size of the button. */
  size?: number
  /** Prevent the click from bubbling to a row-level link/handler (default true). */
  stopPropagation?: boolean
}) {
  const [enabled] = useAuxEnabled()
  const [role] = useAuxRole()
  const [flash, setFlash] = useState<null | "ok" | "none" | "err">(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const target = otherRole(role)
  const targetName = target === "desktop" ? "desktop" : "iPad"

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      if (stopPropagation) {
        e.preventDefault()
        e.stopPropagation()
      }
      const delivered = await castUrl(url, label, role)
      const next = delivered === null ? "err" : delivered === 0 ? "none" : "ok"
      setFlash(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setFlash(null), 1800)
    },
    [url, label, role, stopPropagation],
  )

  if (!enabled) return null

  const icon = flash === "ok" ? "✓" : flash === "none" ? "–" : flash === "err" ? "!" : target === "desktop" ? "🖥️" : "📲"
  const color =
    flash === "ok" ? "#22c55e" : flash === "err" ? "#ef4444" : flash === "none" ? "#f59e0b" : "var(--muted)"

  return (
    <button
      onClick={onClick}
      title={
        flash === "none"
          ? `No ${targetName} connected`
          : flash === "ok"
            ? `Sent to ${targetName}`
            : `Show on the ${targetName}`
      }
      aria-label={`Show on the ${targetName}`}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        border: "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        color,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        cursor: "pointer",
        padding: 0,
        transition: "color 0.15s, background 0.15s",
      }}
    >
      {icon}
    </button>
  )
}
