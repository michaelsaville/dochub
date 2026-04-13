"use client"

import { db, type SyncQueueEntry } from "./offline-db"

// ── State ────────────────────────────────────────────────────────────────

let initialized = false
let flushing = false
const subscribers: ((state: SyncState) => void)[] = []

export type SyncState = {
  online: boolean
  queueSize: number
  syncing: boolean
}

function getState(): SyncState {
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    queueSize: 0, // updated async
    syncing: flushing,
  }
}

async function getStateAsync(): Promise<SyncState> {
  const size = await db.syncQueue.count()
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    queueSize: size,
    syncing: flushing,
  }
}

function notify() {
  getStateAsync().then(s => subscribers.forEach(fn => fn(s)))
}

export function subscribeSyncState(fn: (state: SyncState) => void) {
  subscribers.push(fn)
  return () => {
    const idx = subscribers.indexOf(fn)
    if (idx >= 0) subscribers.splice(idx, 1)
  }
}

// ── Init ─────────────────────────────────────────────────────────────────

export function initSyncQueue() {
  if (initialized || typeof window === "undefined") return
  initialized = true

  window.addEventListener("online", () => {
    notify()
    flushQueue()
  })
  window.addEventListener("offline", () => notify())

  // Flush any pending ops on startup
  if (navigator.onLine) flushQueue()
}

// ── Enqueue a request (call instead of fetch for mutations) ──────────────

export function generateOpId(): string {
  return crypto.randomUUID()
}

export async function enqueueRequest(
  method: string,
  url: string,
  body?: any,
  type: string = "MUTATION"
): Promise<Response | null> {
  const clientOpId = body?.clientOpId || generateOpId()
  if (body && !body.clientOpId) body.clientOpId = clientOpId

  // Try immediate fetch if online
  if (navigator.onLine) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res // Success or client error — don't queue
      }
      // 5xx — fall through to queue
    } catch {
      // Network error — fall through to queue
    }
  }

  // Queue for later
  await db.syncQueue.add({
    type,
    method,
    url,
    body: body ? JSON.stringify(body) : undefined,
    clientOpId,
    createdAt: Date.now(),
    retryCount: 0,
    nextAttemptAt: Date.now(),
  })

  notify()
  return null // Caller knows it was queued
}

// ���─ Flush queue ──────────────────────────────────────────────────────────

const BACKOFF_STEPS = [5000, 15000, 45000, 135000, 405000, 600000] // 5s → 10m cap

export async function flushQueue() {
  if (flushing || !navigator.onLine) return
  flushing = true
  notify()

  try {
    const entries = await db.syncQueue
      .where("nextAttemptAt")
      .belowOrEqual(Date.now())
      .sortBy("createdAt")

    for (const entry of entries) {
      try {
        const res = await fetch(entry.url, {
          method: entry.method,
          headers: { "Content-Type": "application/json" },
          body: entry.body || undefined,
        })

        if (res.ok) {
          // Success — remove from queue
          await db.syncQueue.delete(entry.id!)
          window.dispatchEvent(new CustomEvent("dochub:sync-op-completed", {
            detail: { type: entry.type, clientOpId: entry.clientOpId },
          }))
        } else if (res.status >= 400 && res.status < 500) {
          // Client error — drop (won't succeed on retry)
          await db.syncQueue.delete(entry.id!)
        } else {
          // Server error — retry with backoff
          const nextRetry = entry.retryCount + 1
          const delay = BACKOFF_STEPS[Math.min(nextRetry, BACKOFF_STEPS.length - 1)]
          await db.syncQueue.update(entry.id!, {
            retryCount: nextRetry,
            nextAttemptAt: Date.now() + delay,
            error: `HTTP ${res.status}`,
          })
        }
      } catch (e: any) {
        // Network error — retry with backoff
        const nextRetry = entry.retryCount + 1
        const delay = BACKOFF_STEPS[Math.min(nextRetry, BACKOFF_STEPS.length - 1)]
        await db.syncQueue.update(entry.id!, {
          retryCount: nextRetry,
          nextAttemptAt: Date.now() + delay,
          error: e.message,
        })
      }
    }
  } finally {
    flushing = false
    notify()
  }
}
