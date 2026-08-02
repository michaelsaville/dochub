"use client"

import { useCallback, useRef, useState } from "react"

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
  const svgRef = useRef<SVGSVGElement | null>(null)
  // Active pointers by id — two of them means a pinch, and we must not also pan.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const panning = useRef<{ x: number; y: number; box: Box } | null>(null)
  const pinch = useRef<{ dist: number; box: Box; cx: number; cy: number } | null>(null)
  const moved = useRef(false)

  /** Client coords -> viewBox coords. Everything positional goes through this. */
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return {
      x: box.x + ((clientX - r.left) / r.width) * box.w,
      y: box.y + ((clientY - r.top) / r.height) * box.h,
    }
  }, [box])

  const reset = useCallback(() => setBox(initial), [initial.x, initial.y, initial.w, initial.h]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Zoom about a fixed client point, so the thing under the finger stays put. */
  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    setBox((b) => {
      const el = svgRef.current
      if (!el) return b
      const r = el.getBoundingClientRect()
      const scale = initial.w / b.w
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
      const w = initial.w / next
      const h = initial.h / next
      const px = (clientX - r.left) / r.width
      const py = (clientY - r.top) / r.height
      return { x: b.x + (b.w - w) * px, y: b.y + (b.h - h) * py, w, h }
    })
  }, [initial.w, initial.h])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
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
    const r = el.getBoundingClientRect()
    const dx = ((e.clientX - start.x) / r.width) * start.box.w
    const dy = ((e.clientY - start.y) / r.height) * start.box.h
    // 3px of slop so a tap that wobbles still registers as a tap, not a pan.
    if (Math.abs(e.clientX - start.x) > 3 || Math.abs(e.clientY - start.y) > 3) moved.current = true
    setBox({ ...start.box, x: start.box.x - dx, y: start.box.y - dy })
  }, [zoomAt])

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) panning.current = null
  }, [])

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
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
      style: { touchAction: "none" as const, userSelect: "none" as const },
    },
  }
}
