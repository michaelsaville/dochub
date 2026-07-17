"use client"

import React, { useEffect, useRef, useState } from "react"

// =============================================================================
// Sheet — DocHub's one mobile-primitive overlay (Phase-1 shared infra).
//
// Below 640px it renders as a bottom sheet: slides up from the bottom, has a
// 40px drag handle (drag-down to dismiss), an internally-scrolling body, and a
// STICKY footer action bar padded with env(safe-area-inset-bottom) so buttons
// clear the iOS home indicator. Above 640px it becomes a centered modal card.
//
// Every desktop modal / inline form / picker / confirm is meant to mount inside
// this instead of hand-rolling its own overlay. Uses DocHub tokens + .btn
// classes + --shadow-lg; closes on Escape + backdrop click; locks body scroll
// and does basic focus handling (focus trap + restore) while open.
// =============================================================================

const MOBILE_QUERY = "(max-width: 640px)"

// SSR-safe viewport check — only touches window inside the effect. Starts
// `false` (desktop) so server render and first client render agree, then the
// effect flips it on mount / when the query changes.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return isMobile
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Distance (px) the sheet must be dragged down before release dismisses it.
const DISMISS_THRESHOLD = 110

export default function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 640,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: number
}): React.ReactElement | null {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  const [entered, setEntered] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef<number | null>(null)

  // Escape handling, focus trap, scroll lock, focus save/restore, enter anim.
  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // Trigger the slide-in on the next frame so the transition runs.
    const enterRaf = requestAnimationFrame(() => setEntered(true))
    // Move focus into the sheet once it exists.
    const focusRaf = requestAnimationFrame(() => panelRef.current?.focus())

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        if (nodes.length === 0) {
          e.preventDefault()
          panelRef.current.focus()
          return
        }
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)

    return () => {
      window.removeEventListener("keydown", onKey)
      cancelAnimationFrame(enterRaf)
      cancelAnimationFrame(focusRaf)
      document.body.style.overflow = prevOverflow
      setEntered(false)
      setDragY(0)
      setDragging(false)
      dragStartY.current = null
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  // --- drag-to-dismiss (mobile only), attached to the handle region ---
  function onDragStart(clientY: number) {
    if (!isMobile) return
    dragStartY.current = clientY
    setDragging(true)
  }
  function onDragMove(clientY: number) {
    if (dragStartY.current == null) return
    const delta = clientY - dragStartY.current
    setDragY(delta > 0 ? delta : 0)
  }
  function onDragEnd() {
    if (dragStartY.current == null) return
    dragStartY.current = null
    setDragging(false)
    if (dragY > DISMISS_THRESHOLD) onClose()
    else setDragY(0)
  }

  const backdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: isMobile ? "flex-end" : "center",
    justifyContent: "center",
    padding: isMobile ? 0 : "var(--space-6)",
    opacity: entered ? 1 : 0,
    transition: "opacity 0.2s ease",
    WebkitTapHighlightColor: "transparent",
  }

  // Slide-in from below on mobile; subtle rise + fade on desktop.
  const closedTransform = isMobile ? "translateY(100%)" : "translateY(8px) scale(0.985)"
  const openTransform = isMobile ? `translateY(${dragY}px)` : "translateY(0) scale(1)"
  const panel: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: isMobile ? "100%" : maxWidth,
    maxHeight: isMobile ? "92dvh" : "88vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: isMobile ? "16px 16px 0 0" : 12,
    boxShadow: "var(--shadow-lg)",
    overflow: "hidden",
    color: "var(--text)",
    transform: entered ? openTransform : closedTransform,
    opacity: isMobile ? 1 : entered ? 1 : 0,
    transition: dragging ? "none" : "transform 0.26s cubic-bezier(0.32,0.72,0,1), opacity 0.2s ease",
    outline: "none",
  }

  const header: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    padding: "var(--space-3) var(--space-4)",
    flexShrink: 0,
    borderBottom: "1px solid var(--border)",
  }

  const body: React.CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    padding: "var(--space-4)",
  }

  const footerBar: React.CSSProperties = {
    flexShrink: 0,
    display: "flex",
    gap: "var(--space-3)",
    justifyContent: "flex-end",
    alignItems: "center",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
    padding: isMobile
      ? "var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom))"
      : "var(--space-3) var(--space-4)",
  }

  const showHeader = Boolean(title) || !isMobile

  return (
    <div
      style={backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        tabIndex={-1}
        style={panel}
      >
        {/* Drag handle (mobile only) — drag down to dismiss */}
        {isMobile && (
          <div
            onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
            onTouchMove={(e) => onDragMove(e.touches[0].clientY)}
            onTouchEnd={onDragEnd}
            onTouchCancel={onDragEnd}
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: 28,
              paddingTop: 8,
              touchAction: "none",
              cursor: "grab",
            }}
            aria-hidden="true"
          >
            <span
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                background: "var(--border)",
                display: "block",
              }}
            />
          </div>
        )}

        {showHeader && (
          <div style={header}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: "var(--text-lg)",
                fontWeight: 600,
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              style={{
                minWidth: 44,
                minHeight: 44,
                justifyContent: "center",
                fontSize: 20,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        <div style={body}>{children}</div>

        {footer && <div style={footerBar}>{footer}</div>}
      </div>
    </div>
  )
}
