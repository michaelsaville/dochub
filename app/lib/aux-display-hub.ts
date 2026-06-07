import "server-only"

/**
 * In-memory pub/sub spine for the iPad "aux display" feature.
 *
 * A device opens an SSE connection (see app/api/aux-display/stream) and
 * subscribes to a "room" keyed by their **email** — the one identity DocHub
 * and TicketHub agree on (each app's local userId differs; the Azure SSO
 * email is the shared key).
 *
 * Within a room, every connection has a **role**:
 *   - "ipad"    — the aux/second screen. Receives ticket-open context from
 *                 TicketHub and follows along.
 *   - "desktop" — the tech's main screen (a DocHub tab). Receives "casts"
 *                 pushed from the iPad.
 *
 * Events carry a `target` role and are only delivered to connections with
 * that role. This is what lets the link be bidirectional without crossed
 * wires: a ticket-open targets "ipad", an iPad cast targets "desktop", and
 * neither device reacts to its own side's events.
 *
 * Scope/limits:
 *  - State lives in this process. DocHub runs as a single container, so a
 *    Map is sufficient. If DocHub is ever horizontally scaled, this must move
 *    to Postgres LISTEN/NOTIFY or Redis pub/sub.
 *  - Stored on globalThis so Next.js dev HMR / route-module reloads don't
 *    fork the subscriber map.
 */

import { prisma } from "@/lib/prisma"

export type AuxRole = "ipad" | "desktop"
/** Which app's tab should handle the event. */
export type AuxApp = "dochub" | "tickethub"

export type AuxEvent =
  | {
      type: "navigate"
      target: AuxRole
      app: AuxApp
      url: string
      label: string | null
      clientName: string | null
      ticketNumber: number | null
      source: string
      ts: number
    }
  | {
      type: "notfound"
      target: AuxRole
      app: AuxApp
      url: null
      label: null
      clientName: string | null
      ticketNumber: number | null
      source: string
      ts: number
    }
  | { type: "connected"; ts: number }

/**
 * Postgres NOTIFY channel — the cross-app bus. DocHub publishes here so the
 * OTHER app sharing this database (TicketHub) can LISTEN and deliver events
 * to its own connected tabs. DocHub itself does NOT listen — its own
 * subscribers are served from the in-memory Map below (same process), so
 * there's no double-delivery.
 */
const BUS_CHANNEL = "aux_display"

type Subscriber = { role: AuxRole; fn: (event: AuxEvent) => void }

type HubState = {
  rooms: Map<string, Set<Subscriber>>
}

const g = globalThis as unknown as { __dochubAuxHub?: HubState }
const hub: HubState = g.__dochubAuxHub ?? { rooms: new Map() }
if (!g.__dochubAuxHub) g.__dochubAuxHub = hub

function roomKey(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Register a subscriber for a user's room under a given role. Returns an
 * unsubscribe function that removes it (and prunes the room when it empties).
 */
export function subscribe(
  email: string,
  role: AuxRole,
  fn: (event: AuxEvent) => void,
): () => void {
  const key = roomKey(email)
  let set = hub.rooms.get(key)
  if (!set) {
    set = new Set()
    hub.rooms.set(key, set)
  }
  const sub: Subscriber = { role, fn }
  set.add(sub)
  return () => {
    const s = hub.rooms.get(key)
    if (!s) return
    s.delete(sub)
    if (s.size === 0) hub.rooms.delete(key)
  }
}

/**
 * Deliver an event to every connection in a user's room whose role matches
 * the event's target. Returns how many connections it reached (0 = no
 * matching device paired/awake). `connected` events are sent directly by the
 * stream, never published, so they have no target.
 */
export function publish(email: string, event: AuxEvent): number {
  // Broadcast to the cross-app bus (TicketHub etc.) — fire-and-forget so a
  // DB hiccup never blocks or fails the in-process delivery below.
  void notifyBus(email, event)

  const set = hub.rooms.get(roomKey(email))
  if (!set || set.size === 0) return 0
  const target = "target" in event ? event.target : null
  let delivered = 0
  for (const sub of set) {
    if (target && sub.role !== target) continue
    try {
      sub.fn(event)
      delivered++
    } catch {
      // A dead controller throws on enqueue; the stream's own cancel/abort
      // handler will unsubscribe it. Skip and keep delivering to the rest.
    }
  }
  return delivered
}

/** Emit the event onto the Postgres NOTIFY bus for cross-app listeners. */
async function notifyBus(email: string, event: AuxEvent): Promise<void> {
  if (!("target" in event)) return // 'connected' is per-connection, never bussed
  try {
    const payload = JSON.stringify({ email: roomKey(email), event })
    await prisma.$executeRawUnsafe("SELECT pg_notify($1, $2)", BUS_CHANNEL, payload)
  } catch {
    // best-effort cross-app delivery
  }
}

/** How many live connections a user has, optionally filtered by role. */
export function connectionCount(email: string, role?: AuxRole): number {
  const set = hub.rooms.get(roomKey(email))
  if (!set) return 0
  if (!role) return set.size
  let n = 0
  for (const sub of set) if (sub.role === role) n++
  return n
}
