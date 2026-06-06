"use client"

import { useEffect, useState } from "react"

/**
 * Shared client state for the iPad aux-display "armed" flag.
 *
 * Both the always-mounted pill (AuxDisplayReceiver) and the /aux-display
 * control page read and write the same localStorage key. To keep them in
 * sync live — flip it on the page, the pill reacts instantly, and vice
 * versa — writes go through setAuxEnabled(), which fires a same-tab custom
 * event; we also listen to the cross-tab `storage` event.
 */

export const AUX_LS_KEY = "dochub:auxDisplay"
export const AUX_ROLE_KEY = "dochub:auxRole"
const AUX_EVENT = "aux-display:set"
const AUX_ROLE_EVENT = "aux-display:role"

export type AuxRole = "ipad" | "desktop"

export function getAuxEnabled(): boolean {
  try {
    return localStorage.getItem(AUX_LS_KEY) === "1"
  } catch {
    return false
  }
}

export function setAuxEnabled(next: boolean): void {
  try {
    localStorage.setItem(AUX_LS_KEY, next ? "1" : "0")
  } catch {
    /* private mode / no storage */
  }
  try {
    window.dispatchEvent(new CustomEvent(AUX_EVENT, { detail: next }))
  } catch {
    /* SSR / no window */
  }
}

/** Reactive [enabled, setEnabled] bound to the shared flag across components/tabs. */
export function useAuxEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    setEnabled(getAuxEnabled())

    const onCustom = (e: Event) => {
      setEnabled(Boolean((e as CustomEvent).detail))
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUX_LS_KEY) setEnabled(e.newValue === "1")
    }
    window.addEventListener(AUX_EVENT, onCustom)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(AUX_EVENT, onCustom)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return [enabled, setAuxEnabled]
}

// ── Device role (which screen this browser is) ──────────────────────────────

export function getAuxRole(): AuxRole {
  try {
    return localStorage.getItem(AUX_ROLE_KEY) === "desktop" ? "desktop" : "ipad"
  } catch {
    return "ipad"
  }
}

export function setAuxRole(next: AuxRole): void {
  try {
    localStorage.setItem(AUX_ROLE_KEY, next)
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(AUX_ROLE_EVENT, { detail: next }))
  } catch {
    /* ignore */
  }
}

/** Reactive [role, setRole] bound to the shared device-role flag. */
export function useAuxRole(): [AuxRole, (next: AuxRole) => void] {
  const [role, setRole] = useState<AuxRole>("ipad")

  useEffect(() => {
    setRole(getAuxRole())

    const onCustom = (e: Event) => {
      const v = (e as CustomEvent).detail
      setRole(v === "desktop" ? "desktop" : "ipad")
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUX_ROLE_KEY) setRole(e.newValue === "desktop" ? "desktop" : "ipad")
    }
    window.addEventListener(AUX_ROLE_EVENT, onCustom)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(AUX_ROLE_EVENT, onCustom)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return [role, setAuxRole]
}

/** The screen this device casts TO (the opposite of its own role). */
export function otherRole(role: AuxRole): AuxRole {
  return role === "desktop" ? "ipad" : "desktop"
}

/**
 * Push a specific relative URL to the OTHER screen in the user's room.
 * Returns the number of devices it reached, or null on failure.
 */
export async function castUrl(
  url: string,
  label: string | null,
  fromRole: AuxRole,
): Promise<number | null> {
  try {
    const res = await fetch("/api/aux-display/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, label, fromRole }),
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { delivered?: number }
    return typeof data.delivered === "number" ? data.delivered : 0
  } catch {
    return null
  }
}

/**
 * Push this browser's current view (path + query) to the OTHER screen.
 */
export function castCurrentView(fromRole: AuxRole): Promise<number | null> {
  const url = window.location.pathname + window.location.search
  const label = (document.title || "").replace(/\s*[|·–-]\s*DocHub.*$/i, "").trim() || null
  return castUrl(url, label, fromRole)
}
