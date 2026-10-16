/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { guardPileItem } from "@/lib/pile-agent/auth"
import { getOrCreateConversation, runTurn, type AgentEvent } from "@/lib/pile-agent/loop"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 600

// Per-user in-memory throttle (single container): 20 turns / minute, one at a time.
const recent = new Map<string, number[]>()
const running = new Set<string>()

// POST /api/agent/pile/[id]/turn  { text?: string }  →  text/event-stream of AgentEvent
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardPileItem(id)
  if ("error" in g) return g.error
  const body = (await req.json().catch(() => ({}))) as any
  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : null

  const now = Date.now()
  const hits = (recent.get(g.staff.id) || []).filter((t) => now - t < 60_000)
  if (hits.length >= 20) return NextResponse.json({ error: "Slow down — 20 turns per minute" }, { status: 429 })
  hits.push(now); recent.set(g.staff.id, hits)

  const conv = await getOrCreateConversation(id, g.staff)
  if (running.has(conv.id)) return NextResponse.json({ error: "The agent is still working on this item" }, { status: 409 })
  running.add(conv.id)

  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: AgentEvent | { type: "conversation"; id: string }) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`)) } catch { closed = true }
      }
      const hb = setInterval(() => { if (!closed) try { controller.enqueue(encoder.encode(`: ping\n\n`)) } catch { closed = true } }, 15_000)
      send({ type: "conversation", id: conv.id })
      // The turn runs to completion and persists even if the browser disconnects.
      runTurn({ conversationId: conv.id, suggestionId: id, userText: text, scope: g.scope, staffUserId: g.staff.id, emit: send })
        .catch((err) => send({ type: "error", message: String(err?.message || err).slice(0, 300) }))
        .finally(() => {
          running.delete(conv.id)
          clearInterval(hb)
          if (!closed) { closed = true; try { controller.close() } catch {} }
        })
    },
    cancel() { closed = true },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
