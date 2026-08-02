"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * SVG pan/zoom over a viewBox. Hand-rolled, ~90 lines.
 *
 * Deliberately not a library. The repo has no diagram/pan-zoom dependency, and the
 * candidates each bring a real cost: react-zoom-pan-pinch and react-flow wrap the
 * content in their own transformed DOM (breaking print and SVG coordinates),
 * Konva/Fabric are canvas (no text selection, no print, ~150KB). A viewBox is one
 * string; moving it IS the pan, shrinking it IS the zoom, and everything downstream
 * — hit testing, print, screen readers — keeps working because nothing is faked.
 *
 * Pointer Events only. HTML5 drag-and-drop does not fire on iPadOS Safari, and this
 * surface exists to be used on an iPad Mini standing in a wiring closet.
 */

export type Box = { x: number; y: number; w: number; h: number }

const MIN_SCALE = 0.25
const MAX_SCALE = 6

export function usePanZoom(initial: Box) {
  const [box, setBox] = useState<Box>(initial)

  // The content's real dimensions are often not known on first render (a floor plan
  // is fetched). useState only reads its initializer once, so without this the
  // viewBox stays at the placeholder and every toLocal() result is off by the ratio
  // between them — silently writing wrong coordinates to the database.
  useEffect(() => {
    setBox((b) => (b.w === initial.w && b.h === initial.h ? b : { ...initial }))
  }, [initial.x, initial.y, initial.w, initial.h])
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Active pointers by id — two of them means a pinch, and we must not also pan.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const panning = useRef<{ x: number; y: number; box: Box } | null>(null)
  const pinch = useRef<{ dist: number; box: Box; cx: number; cy: number } | null>(null)
  const moved = useRef(false)

  /**
   * Client coords -> user-space (viewBox) coords.
   *
   * Uses getScreenCTM, NOT a getBoundingClientRect ratio. The ratio approach is only
   * correct when the element's aspect ratio happens to equal the viewBox's; the
   * moment preserveAspectRatio letterboxes (which it does by default whenever
   * width/height are set as attributes over a fixed viewBox) every coordinate is
   * offset by the letterbox — silently, and proportionally to how wrong the sizing
   * is. That put rack-editor taps 5-14 ports away from the finger.
   */
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current
    const ctm = el?.getScreenCTM()
    if (!el || !ctm) return { x: 0, y: 0 }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  /** User-space units per CSS pixel, from the same transform. */
  const unitsPerPx = useCallback(() => {
    const ctm = svgRef.current?.getScreenCTM()
    return ctm && ctm.a !== 0 ? 1 / ctm.a : 1
  }, [])

  const reset = useCallback(() => setBox(initial), [initial.x, initial.y, initial.w, initial.h]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Zoom about a fixed client point, so the thing under the finger stays put. */
  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    // Anchor in USER space via the same CTM, not a rect ratio — otherwise the zoom
    // anchor drifts under letterboxing exactly as the tap coordinates did.
    const anchor = toLocal(clientX, clientY)
    setBox((b) => {
      const scale = initial.w / b.w
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      const w = initial.w / next
      const h = initial.h / next
      const fx = b.w === 0 ? 0.5 : (anchor.x - b.x) / b.w
      const fy = b.h === 0 ? 0.5 : (anchor.y - b.y) / b.h
      return { x: anchor.x - fx * w, y: anchor.y - fy * h, w, h }
    })
  }, [toLocal, initial.w, initial.h])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // NOTE: do NOT setPointerCapture here. Per Pointer Events L3, capture retargets
    // every subsequent pointerup to the capture element, and React builds its
    // propagation path from event.target — so capturing on the <svg> silently makes
    // every child onPointerUp unreachable. That killed tap-to-patch entirely
    // (reproduced in Chromium). Capture is taken lazily in onPointerMove, once the
    // gesture has proven itself a pan, which is the only case that needs it.
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    moved.current = false
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        box,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      panning.current = null
    } else if (pointers.current.size === 1) {
      panning.current = { x: e.clientX, y: e.clientY, box }
    }
  }, [box])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0) {
        moved.current = true
        const p = pinch.current
        zoomAt(dist / p.dist, p.cx, p.cy)
        pinch.current = { ...p, dist }
      }
      return
    }

    const start = panning.current
    if (!start) return
    const el = svgRef.current
    if (!el) return
    // Same transform as toLocal — a rect-ratio delta drifts under letterboxing.
    const k = unitsPerPx()
    const dx = (e.clientX - start.x) * k
    const dy = (e.clientY - start.y) * k
    // 3px of slop so a tap that wobbles still registers as a tap, not a pan.
    if (Math.abs(e.clientX - start.x) > 3 || Math.abs(e.clientY - start.y) > 3) {
      if (!moved.current) {
        // Now it is definitely a pan: take capture so dragging outside the element
        // keeps working. Taps never reach here, so their pointerup stays on target.
        try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
      }
      moved.current = true
    }
    setBox({ ...start.box, x: start.box.x - dx, y: start.box.y - dy })
  }, [zoomAt, unitsPerPx])

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      panning.current = null
    } else if (pointers.current.size === 1 && !panning.current) {
      // Lifting one finger out of a pinch used to leave the gesture dead until full
      // release. Re-seat the pan from whichever pointer is still down.
      const [p] = [...pointers.current.values()]
      panning.current = { x: p.x, y: p.y, box }
    }
  }, [box])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)
  }, [zoomAt])

  return {
    box,
    setBox,
    svgRef,
    reset,
    toLocal,
    /** True if the gesture that just ended was a drag — use it to suppress click-through. */
    didPan: () => moved.current,
    scale: initial.w / box.w,
    /** Spread onto the <svg>. touchAction:none is required or the browser scrolls instead. */
    bind: {
      ref: svgRef,
      viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
      onPointerDown,
      onPointerMove,
      // Capture phase: runs before any child handler and cannot be stopped by one.
      // This is the ONLY place the pointer map is cleaned up.
      onPointerUpCapture: onPointerUp,
      onPointerCancelCapture: onPointerUp,
      onWheel,
      style: { touchAction: "none" as const, userSelect: "none" as const },
    },
  }
}
