/**
 * Recently-opened items, per browser (localStorage). Client-side only — no
 * server imports. Every access is wrapped in try/catch: storage can be
 * missing (private mode, blocked site data) and callers must still render.
 *
 * Stable API (used by Sidebar client switcher, /clients list, SearchModal):
 *   pushRecent(item)            record an open (dedup by type+id, newest first)
 *   getRecents(limit?)          newest first
 *   getRecentClients(limit?)    distinct clients derived from all recents
 *   RECENTS_EVENT               window event fired after every change
 */

export type RecentItem = {
  type: string          // "client" | "asset" | "credential" | "document" | "runbook" | ...
  id: string
  title: string
  subtitle?: string
  href: string
  clientId?: string
  clientName?: string
  at?: number           // set by pushRecent
}

const KEY = "dochub:recents:v1"
const MAX = 30
export const RECENTS_EVENT = "dochub:recents-changed"

function read(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => x && x.type && x.id && x.href) : []
  } catch {
    return []
  }
}

function write(items: RecentItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)))
    window.dispatchEvent(new Event(RECENTS_EVENT))
  } catch {
    /* storage unavailable */
  }
}

export function pushRecent(item: RecentItem) {
  if (typeof window === "undefined" || !item?.id) return
  const rest = read().filter((r) => !(r.type === item.type && r.id === item.id))
  write([{ ...item, at: Date.now() }, ...rest])
}

export function getRecents(limit = MAX): RecentItem[] {
  if (typeof window === "undefined") return []
  return read().slice(0, limit)
}

export function getRecentClients(limit = 8): { id: string; name: string; at: number }[] {
  const seen = new Set<string>()
  const out: { id: string; name: string; at: number }[] = []
  for (const r of getRecents()) {
    const id = r.type === "client" ? r.id : r.clientId
    const name = r.type === "client" ? r.title : r.clientName
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, at: r.at ?? 0 })
    if (out.length >= limit) break
  }
  return out
}

export function removeRecentClient(clientId: string) {
  write(read().filter((r) => r.id !== clientId && r.clientId !== clientId))
}
