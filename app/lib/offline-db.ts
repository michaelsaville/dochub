import Dexie, { type Table } from "dexie"

// ── Cached data tables (read offline) ────────────────────────────────────

export interface CachedClient {
  id: string
  name: string
  type: string
  isActive: boolean
  syncroId?: string
  updatedAt: string
}

export interface CachedAsset {
  id: string
  clientId: string
  name: string
  friendlyName?: string
  category: string
  make?: string
  model?: string
  serial?: string
  ipAddress?: string
  macAddress?: string
  status?: string
  updatedAt: string
}

export interface CachedCredential {
  id: string
  clientId: string
  label: string
  username?: string
  url?: string
  notes?: string
  hasPassword: boolean
  hasTotp: boolean
  updatedAt: string
}

export interface CachedDocument {
  id: string
  clientId: string
  title: string
  content?: string
  category?: string
  isPinned: boolean
  needsReview: boolean
  updatedAt: string
}

export interface CachedContact {
  id: string
  clientId: string
  name: string
  role?: string
  email?: string
  phone?: string
  mobile?: string
  isPrimary: boolean
}

// ── Sync queue (write offline) ───────────��───────────────────────────────

export interface SyncQueueEntry {
  id?: number           // auto-incremented
  type: string          // e.g. "UPDATE_DOCUMENT", "CREATE_CREDENTIAL"
  method: string        // "POST" | "PATCH" | "PUT" | "DELETE"
  url: string           // API endpoint path
  body?: string         // JSON stringified body
  clientOpId: string    // idempotency key
  createdAt: number     // Date.now()
  retryCount: number
  nextAttemptAt: number
  error?: string
}

// ── Database ───────────────────────────────���─────────────────────────────

class DocHubOfflineDB extends Dexie {
  clients!: Table<CachedClient, string>
  assets!: Table<CachedAsset, string>
  credentials!: Table<CachedCredential, string>
  documents!: Table<CachedDocument, string>
  contacts!: Table<CachedContact, string>
  syncQueue!: Table<SyncQueueEntry, number>

  constructor() {
    super("dochub-offline")

    this.version(1).stores({
      clients: "id, name, updatedAt",
      assets: "id, clientId, name, updatedAt",
      credentials: "id, clientId, label, updatedAt",
      documents: "id, clientId, title, updatedAt",
      contacts: "id, clientId, name",
      syncQueue: "++id, type, clientOpId, createdAt, nextAttemptAt",
    })
  }
}

export const db = new DocHubOfflineDB()
