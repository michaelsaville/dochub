"use client" // Error boundaries must be Client Components

import { useEffect } from "react"

/**
 * Root error boundary.
 *
 * Why this exists: until 2026-08-02 the app had NO error boundary anywhere, so a
 * single null deref in a deeply-nested render (e.g. a port row whose owning device
 * relation had moved from NetworkDevice to Asset) blanked the entire page with
 * Next's bare fallback. This caps the blast radius of any future one.
 *
 * NOTE: this Next version passes `unstable_retry` (re-fetch + re-render), not the
 * older `reset` (clear state only). See node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/error.md — `reset` still exists but does not
 * re-fetch, which is the wrong recovery for a bad-data render.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[dochub] unhandled render error", error)
  }, [error])

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "var(--space-4)",
        margin: "var(--space-12) auto",
        maxWidth: "560px",
        padding: "var(--space-6)",
        background: "var(--card)",
        border: "1px solid var(--color-border-danger)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--text)" }}>
        Something went wrong on this page
      </div>
      <div style={{ fontSize: "var(--text-base)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        The rest of DocHub is unaffected — this is scoped to the current view. Retrying
        re-fetches the data, which clears it when the cause was transient.
      </div>
      {error.digest && (
        <div style={{ fontFamily: "var(--mono)", fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
          Reference: {error.digest}
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button className="btn btn-primary" onClick={() => unstable_retry()}>
          Try again
        </button>
        <a className="btn btn-secondary" href="/">
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
