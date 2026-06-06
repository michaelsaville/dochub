import "server-only"

/**
 * In-memory pub/sub spine for the iPad "aux display" feature.
 *
 * A tech's iPad opens an SSE connection (see app/api/aux-display/stream) and
 * subscribes to a "room" keyed by their **email** — the one identity both
 * DocHub and TicketHub agree on (each app's local userId differs; the Azure
 * SSO email is the shared key). When TicketHub emits a "ticket opened" context
 * event (see app/api/aux-display/emit), we publish to that room and every one
 * of the user's connected iPads flips to the client's DocHub page.
 *
 * Scope/limits:
 *  - State lives in this process. DocHub runs as a single container, so a
 *    Map is sufficient. If DocHub is ever horizontally scaled, this must move
 *    to Postgres LISTEN/NOTIFY or Redis pub/sub — emit and stream would then
 *    land on different replicas and miss each other.
 *  - Stored on globalThis so Next.js dev HMR / route-module reloads don't
 *    fork the subscriber map.
 */

export type AuxEvent =
  | {
      type: "navigate"
      url: string
      label: string | null
      clientName: string | null
      ticketNumber: number | null
      source: string
      ts: number
    }
  | {
      type: "notfound"
      url: null
      label: null
      clientName: string | null
      ticketNumber: number | null
      source: string
      ts: number
    }
  | { type: "connected"; ts: number }

type Subscriber = (event: AuxEvent) => void

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
 * Register a subscriber for a user's room. Returns an unsubscribe function
 * that removes it (and prunes the room when it empties).
 */
export function subscribe(email: string, fn: Subscriber): () => void {
  const key = roomKey(email)
  let set = hub.rooms.get(key)
  if (!set) {
    set = new Set()
    hub.rooms.set(key, set)
  }
  set.add(fn)
  return () => {
    const s = hub.rooms.get(key)
    if (!s) return
    s.delete(fn)
    if (s.size === 0) hub.rooms.delete(key)
  }
}

/**
 * Deliver an event to every connection in a user's room.
 * Returns the number of connections it reached (0 = no iPad paired/awake).
 */
export function publish(email: string, event: AuxEvent): number {
  const set = hub.rooms.get(roomKey(email))
  if (!set || set.size === 0) return 0
  let delivered = 0
  for (const fn of set) {
    try {
      fn(event)
      delivered++
    } catch {
      // A dead controller throws on enqueue; the stream's own cancel/abort
      // handler will unsubscribe it. Skip and keep delivering to the rest.
    }
  }
  return delivered
}

/** How many live connections a user currently has (for status/debug). */
export function connectionCount(email: string): number {
  return hub.rooms.get(roomKey(email))?.size ?? 0
}
