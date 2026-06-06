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
const AUX_EVENT = "aux-display:set"

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
