import { requireAuth } from "@/lib/auth"
import { subscribe, type AuxEvent } from "@/lib/aux-display-hub"

// SSE must stream from the Node runtime and never be statically cached.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/**
 * GET /api/aux-display/stream
 *
 * The iPad opens this once and holds it. We authenticate the staff session,
 * key the room by their email, and push every aux event as SSE `data:` lines.
 * A comment heartbeat every 25s keeps proxies (nginx) from idling the
 * connection out.
 */
export async function GET(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const email = session?.user?.email
  if (!email) {
    return new Response("No email on session", { status: 400 })
  }

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AuxEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      // Greet so the client flips its status to "connected" immediately.
      send({ type: "connected", ts: Date.now() })
      unsubscribe = subscribe(email, send)

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`))
        } catch {
          cleanup()
        }
      }, 25_000)

      const cleanup = () => {
        if (heartbeat) {
          clearInterval(heartbeat)
          heartbeat = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      // Client navigated away / closed the tab.
      req.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      if (unsubscribe) unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable nginx response buffering so events flush in realtime.
      "X-Accel-Buffering": "no",
    },
  })
}
