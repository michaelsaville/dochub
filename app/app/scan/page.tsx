"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import AppShell from "@/components/AppShell"

/**
 * Field scan view. DocHub prints asset QR labels encoding
 * https://dochub.pcc2k.com/assets/<id> — scanning one jumps straight to the
 * asset. Uses the native BarcodeDetector (Chrome/Android); on browsers without
 * it (iOS Safari today) it degrades to a manual serial box.
 */
export default function ScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState("")
  const [decoded, setDecoded] = useState<string | null>(null)
  const [noMatch, setNoMatch] = useState<string | null>(null)

  // Resolve a scanned serial / barcode via the asset-aware global search and
  // jump to the asset (or client) — /clients?q= ignored the query.
  async function goSearch(value: string) {
    setNoMatch(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`)
      if (res.ok) {
        const d = await res.json()
        if (d.assets?.[0]) { router.push(`/assets/${d.assets[0].id}`); return }
        if (d.clients?.[0]) { router.push(`/clients/${d.clients[0].id}`); return }
      }
    } catch { /* fall through to no-match */ }
    setNoMatch(value)
  }

  useEffect(() => {
    const hasDetector = typeof window !== "undefined" && "BarcodeDetector" in window
    setSupported(hasDetector)
    if (!hasDetector) return

    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13"] })

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        await v.play()
        scan()
      } catch {
        setError("Couldn't open the camera. Grant camera permission or type the serial below.")
      }
    }

    async function scan() {
      const v = videoRef.current
      if (stopped || !v) return
      try {
        const codes = await detector.detect(v)
        if (codes.length) { handle(codes[0].rawValue as string); return }
      } catch { /* transient — keep scanning */ }
      raf = requestAnimationFrame(scan)
    }

    function handle(value: string) {
      stopped = true
      setDecoded(value)
      // A DocHub asset/client label → navigate straight there.
      try {
        const u = new URL(value)
        if (/\/(assets|clients)\//.test(u.pathname)) { router.push(u.pathname + u.search); return }
      } catch { /* not a URL — treat as a serial/barcode → search */ }
      goSearch(value)
    }

    start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [router])

  return (
    <AppShell>
      <div style={{ padding: "16px", maxWidth: "520px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Scan</h1>

        {supported && !error && (
          <>
            <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: "12px", background: "#000", aspectRatio: "3 / 4", objectFit: "cover" }} />
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px" }}>Point at an asset QR label to open it.</p>
          </>
        )}

        {decoded && (
          <div style={{ marginTop: "12px", padding: "10px 12px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", fontSize: "13px" }}>
            Scanned: <span style={{ fontFamily: "monospace" }}>{decoded}</span>
            {!/\/(assets|clients)\//.test(decoded) && (
              <div style={{ marginTop: "6px" }}>
                <button onClick={() => goSearch(decoded)} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Search for this</button>
              </div>
            )}
            {noMatch && <div style={{ marginTop: "6px", color: "var(--color-text-muted)" }}>No asset or client found for <span style={{ fontFamily: "monospace" }}>{noMatch}</span>.</div>}
          </div>
        )}

        {(supported === false || error) && (
          <div style={{ marginTop: "12px" }}>
            {error && <p style={{ fontSize: "13px", color: "#ffb347", marginBottom: "10px" }}>{error}</p>}
            {supported === false && <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>Live scanning isn&apos;t supported on this browser. Type the serial / asset tag to search.</p>}
            <form onSubmit={e => { e.preventDefault(); if (manual.trim()) goSearch(manual.trim()) }} style={{ display: "flex", gap: "8px" }}>
              <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Serial or asset tag" style={{ flex: 1, padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
              <button type="submit" style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Search</button>
            </form>
            {noMatch && <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "8px" }}>No asset or client found for <span style={{ fontFamily: "monospace" }}>{noMatch}</span>.</p>}
          </div>
        )}
      </div>
    </AppShell>
  )
}
