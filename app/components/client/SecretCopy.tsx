"use client"

import { useState } from "react"

/**
 * One-tap copy of a credential secret straight from a row. Fetches through the
 * normal reveal endpoint (so TECH reveal restrictions + reveal auditing still
 * apply) and never renders the secret.
 *
 * iOS Safari only allows clipboard writes inside the user gesture; handing
 * ClipboardItem a *promise* keeps the gesture alive across the fetch. Other
 * browsers fall back to fetch → writeText.
 */
type Field = "password" | "totp" | "username"

async function fetchSecret(credId: string, field: Field): Promise<string> {
  const res = await fetch(`/api/credentials/${credId}/reveal`)
  if (res.status === 403) throw new Error("Not allowed — ask an admin to enable tech reveal")
  if (!res.ok) throw new Error("Reveal failed")
  const d = await res.json()
  const v = field === "password" ? d.password : field === "totp" ? d.totpCode : d.username
  if (!v) throw new Error(field === "totp" ? "No 2FA code" : "Empty")
  return String(v)
}

export async function copySecret(credId: string, field: Field): Promise<void> {
  const CI = (typeof window !== "undefined" ? (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem : undefined)
  if (CI && navigator.clipboard?.write) {
    try {
      const blob = fetchSecret(credId, field).then((t) => new Blob([t], { type: "text/plain" }))
      await navigator.clipboard.write([new CI({ "text/plain": blob })])
      return
    } catch (e) {
      // A reveal error surfaces here too; only fall through for clipboard API quirks.
      if (e instanceof Error && /Not allowed|Reveal failed|No 2FA|Empty/.test(e.message)) throw e
    }
  }
  const text = await fetchSecret(credId, field)
  await navigator.clipboard.writeText(text)
}

export default function SecretCopy({
  credId, field, label, plainValue, compact,
}: {
  credId: string
  field: Field
  label?: string
  /** For non-secret values (username) pass it directly — no fetch. */
  plainValue?: string | null
  compact?: boolean
}) {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle")
  const [msg, setMsg] = useState("")

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation()
    setState("busy")
    try {
      if (plainValue != null) await navigator.clipboard.writeText(plainValue)
      else await copySecret(credId, field)
      setState("ok")
      setMsg("")
    } catch (err) {
      setState("err")
      setMsg(err instanceof Error ? err.message : "Copy failed")
    }
    setTimeout(() => setState("idle"), 1600)
  }

  const text = state === "ok" ? "Copied ✓" : state === "err" ? "✕" : state === "busy" ? "…" : (label ?? "Copy")
  return (
    <button
      type="button"
      onClick={onClick}
      title={state === "err" ? msg : `Copy ${field === "totp" ? "2FA code" : field}`}
      className={`dh-copy-btn${compact ? " compact" : ""}${state === "ok" ? " ok" : ""}${state === "err" ? " err" : ""}`}
    >
      {text}
    </button>
  )
}
