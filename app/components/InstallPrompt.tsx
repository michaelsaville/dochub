"use client"

import { useEffect, useState } from "react"

const SNOOZE_KEY = "dochub_install_snoozed"
const SNOOZE_DAYS = 7

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Already installed / running standalone — don't nag.
    if (window.matchMedia?.("(display-mode: standalone)").matches) return
    // Check snooze
    const snoozed = localStorage.getItem(SNOOZE_KEY)
    if (snoozed && Date.now() < parseInt(snoozed)) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }

    window.addEventListener("beforeinstallprompt", handler as EventListener)
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener)
  }, [])

  if (!show) return null

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === "accepted") {
      setShow(false)
    }
    setDeferredPrompt(null)
  }

  function dismiss() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86400000))
    setShow(false)
  }

  return (
    <div style={{
      position: "fixed",
      bottom: "60px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 9998,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      maxWidth: "380px",
      width: "calc(100% - 32px)",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" }}>
          Install DocHub
        </div>
        <div style={{ fontSize: "11px", color: "var(--muted)" }}>
          Add DocHub to your home screen for one-tap field access
        </div>
      </div>
      <button onClick={install} style={{
        padding: "6px 14px",
        fontSize: "12px",
        fontWeight: 500,
        background: "#3b82f6",
        color: "#fff",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}>
        Install
      </button>
      <button onClick={dismiss} style={{
        padding: "6px 8px",
        fontSize: "11px",
        background: "transparent",
        color: "var(--color-text-muted)",
        border: "none",
        cursor: "pointer",
      }}>
        Later
      </button>
    </div>
  )
}
