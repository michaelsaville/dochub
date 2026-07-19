/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto"
import { encrypt, decrypt } from "@/lib/crypto"

// Secrets in the Notes Intake staging tables are sealed at rest (AES-256-GCM,
// same key/format as the vault) with an "enc:v1:" marker so we can tell a sealed
// value from a user-typed plaintext. Keep this format in sync with
// lib/notes-intake-secrets.mjs (used by the host CLI scripts).
const PREFIX = "enc:v1:"
export const SECRET_KEYS_BY_KIND: Record<string, string[]> = {
  credential: ["password", "totp"],
  phone_extension: ["sipPassword"],
}
const ALL_SECRET_KEYS = new Set(Object.values(SECRET_KEYS_BY_KIND).flat())

export function isSealed(v: any): boolean { return typeof v === "string" && v.startsWith(PREFIX) }
export function sealValue(plain: any): any {
  if (plain == null || plain === "") return plain
  const s = String(plain)
  return isSealed(s) ? s : PREFIX + encrypt(s)
}
export function openValue(v: any): any { return isSealed(v) ? decrypt(v.slice(PREFIX.length)) : v }

// Seal secret fields + ensure a stable eid (idempotent). eid lets reveal/commit
// reconcile secrets by identity even after the reviewer edits/adds/removes items.
export function sealEntities(entities: any[]): any[] {
  return (entities || []).map((e) => {
    const eid = e?.eid || crypto.randomUUID().slice(0, 8)
    const keys = SECRET_KEYS_BY_KIND[e?.kind] || []
    if (!keys.length || !e?.fields) return { ...e, eid }
    const f = { ...e.fields }
    for (const k of keys) if (f[k]) f[k] = sealValue(f[k])
    return { ...e, eid, fields: f }
  })
}
// Decrypt secret fields (for reveal / commit).
export function openEntities(entities: any[]): any[] {
  return (entities || []).map((e) => {
    if (!e?.fields) return e
    const f = { ...e.fields }
    for (const k of Object.keys(f)) if (ALL_SECRET_KEYS.has(k) && isSealed(f[k])) f[k] = openValue(f[k])
    return { ...e, fields: f }
  })
}
// Redact secret fields for the list endpoint: strip the value, mark presence.
export function redactEntities(entities: any[]): any[] {
  return (entities || []).map((e) => {
    if (!e?.fields) return e
    const f = { ...e.fields }
    const sealed: Record<string, boolean> = {}
    for (const k of Object.keys(f)) if (ALL_SECRET_KEYS.has(k) && f[k]) { sealed[k] = true; f[k] = "" }
    return { ...e, fields: f, _sealed: sealed }
  })
}
