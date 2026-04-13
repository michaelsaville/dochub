"use client"

import { db } from "./offline-db"

/**
 * Fetch-and-cache wrapper. Tries network first, falls back to Dexie cache.
 * On successful network fetch, updates the cache in the background.
 */
export async function cachedFetch<T>(
  url: string,
  table: "clients" | "assets" | "credentials" | "documents" | "contacts",
  keyFn: (item: any) => string,
  clientId?: string
): Promise<T[]> {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true

  if (online) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const data: T[] = await res.json()
        // Update cache in background (don't await)
        cacheItems(table, data, keyFn, clientId).catch(() => {})
        return data
      }
    } catch {
      // Network failed — fall through to cache
    }
  }

  // Serve from cache
  const dexieTable = db.table(table)
  if (clientId) {
    return dexieTable.where("clientId").equals(clientId).toArray() as Promise<T[]>
  }
  return dexieTable.toArray() as Promise<T[]>
}

async function cacheItems(
  table: string,
  items: any[],
  keyFn: (item: any) => string,
  clientId?: string
) {
  const dexieTable = db.table(table)

  // Clear old cached items for this client (if scoped)
  if (clientId) {
    const old = await dexieTable.where("clientId").equals(clientId).primaryKeys()
    if (old.length) await dexieTable.bulkDelete(old as string[])
  }

  // Bulk upsert new items
  await dexieTable.bulkPut(items)
}

/**
 * Cache the client list (called on login / app load)
 */
export async function prefetchClients() {
  if (!navigator.onLine) return
  try {
    const res = await fetch("/api/clients")
    if (!res.ok) return
    const clients = await res.json()
    await db.clients.clear()
    await db.clients.bulkPut(
      clients.map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        isActive: c.isActive,
        syncroId: c.syncroId,
        updatedAt: c.updatedAt || new Date().toISOString(),
      }))
    )
  } catch {}
}

/**
 * Cache a client's critical data (called when viewing a client)
 */
export async function prefetchClientData(clientId: string) {
  if (!navigator.onLine) return
  await Promise.allSettled([
    cacheEndpoint(`/api/clients/${clientId}/assets`, "assets", clientId),
    cacheEndpoint(`/api/clients/${clientId}/credentials`, "credentials", clientId),
    cacheEndpoint(`/api/clients/${clientId}/documents`, "documents", clientId),
    cacheEndpoint(`/api/clients/${clientId}/contacts`, "contacts", clientId),
  ])
}

async function cacheEndpoint(url: string, table: string, clientId: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const items = await res.json()
    const dexieTable = db.table(table)
    // Clear old entries for this client
    const old = await dexieTable.where("clientId").equals(clientId).primaryKeys()
    if (old.length) await dexieTable.bulkDelete(old as string[])
    // Store new items (add clientId if not present)
    const mapped = items.map((item: any) => ({
      ...item,
      clientId: item.clientId || clientId,
      updatedAt: item.updatedAt || new Date().toISOString(),
    }))
    if (mapped.length) await dexieTable.bulkPut(mapped)
  } catch {}
}
