/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { writeActivity } from "@/lib/activity"

// Notes Intake — commit an AI-extracted note into real DocHub records.
// Everything here is client-scoped and additive; it never overwrites a
// non-empty Location field. Credentials are AES-256-GCM encrypted via lib/crypto.

const VALID_CATEGORIES = [
  "NETWORK_GEAR", "WIRELESS", "SERVER", "NAS", "COMPUTER", "LAPTOP",
  "TABLET", "PRINTER", "PHONE_SYSTEM", "PHONE_ENDPOINT", "WEBSITE", "VPN", "OTHER",
]
const CATEGORY_ALIAS: Record<string, string> = {
  FIREWALL: "NETWORK_GEAR", SWITCH: "NETWORK_GEAR", ROUTER: "NETWORK_GEAR",
  GATEWAY: "NETWORK_GEAR", AP: "WIRELESS", ACCESS_POINT: "WIRELESS",
  WORKSTATION: "COMPUTER", DESKTOP: "COMPUTER", PC: "COMPUTER",
  PBX: "PHONE_SYSTEM", NVR: "OTHER", DVR: "OTHER", CAMERA: "OTHER",
}
function mapCategory(c: string | null | undefined): string {
  if (!c) return "OTHER"
  const k = c.toUpperCase().replace(/[^A-Z]/g, "_")
  if (VALID_CATEGORIES.includes(k)) return k
  return CATEGORY_ALIAS[k] || "OTHER"
}

export type NoteEntity = {
  kind: "credential" | "asset" | "location_network" | "phone_extension" | "other"
  summary?: string
  include?: boolean
  mode?: "create" | "update" | "skip" // "update" merges into targetId; default "create"
  targetId?: string // existing DocHub record id when mode === "update"
  fields?: Record<string, string | null | undefined>
}

export type CommitSummary = {
  credentials: string[]
  assets: string[]
  phoneExtensions: string[]
  updated: { type: string; id: string; label?: string }[]
  locationUpdated: boolean
  skipped: { kind: string; summary?: string; reason: string }[]
}

// Non-destructive merge of note fields into an existing record: fill only blank
// fields; where both differ, keep existing and record the note's value in notes.
async function mergeExisting(
  kind: string, targetId: string, clientId: string, f: Record<string, any>, summary: CommitSummary,
) {
  const noteLines: string[] = []
  const takeBlank = (existing: any, val: any, fieldLabel: string) => {
    const v = (val ?? "").toString().trim()
    if (!v) return undefined
    const cur = (existing ?? "").toString().trim()
    if (!cur) return v
    if (cur !== v) noteLines.push(`${fieldLabel}: note said "${v}" (kept "${cur}")`)
    return undefined
  }

  if (kind === "asset") {
    const a = await prisma.asset.findFirst({ where: { id: targetId, location: { clientId } } })
    if (!a) throw new Error("asset not found for this client")
    const data: any = {}
    for (const k of ["make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "room", "os"]) {
      const v = takeBlank((a as any)[k], f[k], k); if (v !== undefined) data[k] = v
    }
    if (f.notes) noteLines.push(String(f.notes))
    if (noteLines.length) data.notes = (a.notes ? a.notes + "\n" : "") + "[Notes Intake] " + noteLines.join("; ")
    if (Object.keys(data).length) await prisma.asset.update({ where: { id: a.id }, data })
    summary.updated.push({ type: "asset", id: a.id, label: a.name })
  } else if (kind === "credential") {
    const c = await prisma.credential.findFirst({ where: { id: targetId, clientId } })
    if (!c) throw new Error("credential not found for this client")
    const data: any = {}
    const u = takeBlank(c.username, f.username, "username"); if (u !== undefined) data.username = u
    const url = takeBlank(c.url, f.url, "url"); if (url !== undefined) data.url = url
    // Fill a blank TOTP (e.g. importing an Authy seed onto an existing login);
    // never overwrite an existing secret, and never log a plaintext secret.
    if (f.totp) {
      if (!c.encryptedTotp) data.encryptedTotp = encrypt(String(f.totp))
      else noteLines.push("a TOTP secret was present in the source (existing kept)")
    }
    if (f.password) noteLines.push("source contained a password (existing kept)")
    if (f.notes) noteLines.push(String(f.notes))
    if (noteLines.length) data.notes = (c.notes ? c.notes + "\n" : "") + "[Notes Intake] " + noteLines.join("; ")
    if (Object.keys(data).length) await prisma.credential.update({ where: { id: c.id }, data })
    summary.updated.push({ type: "credential", id: c.id, label: c.label })
  } else if (kind === "phone_extension") {
    const x = await prisma.phoneExtension.findFirst({ where: { id: targetId, system: { clientId } } })
    if (!x) throw new Error("extension not found for this client")
    const data: any = {}
    const dn = takeBlank(x.displayName, f.displayName, "displayName"); if (dn !== undefined) data.displayName = dn
    const did = takeBlank(x.did, f.did, "did"); if (did !== undefined) data.did = did
    if (f.notes) noteLines.push(String(f.notes))
    if (noteLines.length) data.notes = (x.notes ? x.notes + "\n" : "") + "[Notes Intake] " + noteLines.join("; ")
    if (Object.keys(data).length) await prisma.phoneExtension.update({ where: { id: x.id }, data })
    summary.updated.push({ type: "phone_extension", id: x.id, label: `ext ${x.extension}` })
  } else {
    summary.skipped.push({ kind, reason: "update not supported for this type" })
  }
}

export async function commitSuggestion(opts: {
  clientId: string
  entities: NoteEntity[]
  noteTitle: string
  staffUserId?: string | null
}): Promise<CommitSummary> {
  const { clientId, entities, noteTitle, staffUserId } = opts

  const client = await prisma.client.findFirst({
    where: { id: clientId, isActive: true },
    select: { id: true, name: true },
  })
  if (!client) throw new Error("Client not found or inactive")

  const location = await prisma.location.findFirst({
    where: { clientId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, wanIp: true, ispName: true, notes: true },
  })

  const summary: CommitSummary = {
    credentials: [], assets: [], phoneExtensions: [], updated: [], locationUpdated: false, skipped: [],
  }

  for (const e of entities) {
    if (e.include === false) continue
    const f = e.fields || {}
    const label = (f.label || e.summary || "Imported").toString().slice(0, 200)

    // Dedup review decision: skip, or merge into an existing record.
    const mode = e.mode || "create"
    if (mode === "skip") { summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "skipped in review" }); continue }
    if (mode === "update" && e.targetId) {
      try { await mergeExisting(e.kind, e.targetId, clientId, f, summary) }
      catch (err: any) { summary.skipped.push({ kind: e.kind, summary: e.summary, reason: `update failed: ${err?.message || err}` }) }
      continue
    }

    try {
      if (e.kind === "credential") {
        if (!f.password) { summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "no password to vault" }); continue }
        const c = await prisma.credential.create({
          data: {
            clientId, label,
            username: f.username || null,
            encryptedPassword: encrypt(String(f.password)),
            encryptedTotp: f.totp ? encrypt(String(f.totp)) : null,
            url: f.url || null,
            notes: f.notes || null,
            dataSource: "NOTES_INTAKE",
          },
        })
        summary.credentials.push(c.id)
      } else if (e.kind === "asset") {
        if (!location) { summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "client has no active location — add one first" }); continue }
        const a = await prisma.asset.create({
          data: {
            locationId: location.id,
            name: (f.name || e.summary || "Imported asset").toString().slice(0, 200),
            category: mapCategory(f.category) as any,
            make: f.make || null, model: f.model || null, serial: f.serial || null,
            ipAddress: f.ipAddress || null, macAddress: f.macAddress || null,
            managementUrl: f.managementUrl || null, room: f.room || null, os: f.os || null,
            notes: f.notes || null, dataSource: "NOTES_INTAKE",
          },
        })
        summary.assets.push(a.id)
      } else if (e.kind === "location_network") {
        if (!location) { summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "client has no active location" }); continue }
        const upd: any = {}
        if (f.wanIp && !location.wanIp) upd.wanIp = f.wanIp
        if (f.ispName && !location.ispName) upd.ispName = f.ispName
        const extra = [
          f.lanIp && `LAN IP: ${f.lanIp}`,
          f.subnet && `Subnet: ${f.subnet}`,
          f.gateway && `Gateway: ${f.gateway}`,
          f.notes,
        ].filter(Boolean).join("; ")
        if (extra) upd.notes = (location.notes ? location.notes + "\n" : "") + "[Notes Intake] " + extra
        if (Object.keys(upd).length) {
          await prisma.location.update({ where: { id: location.id }, data: upd })
          summary.locationUpdated = true
        } else {
          summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "target fields already populated" })
        }
      } else if (e.kind === "phone_extension") {
        const ps = await prisma.phoneSystem.findFirst({ where: { clientId }, select: { id: true } })
        let credId: string | null = null
        if (f.sipPassword) {
          const c = await prisma.credential.create({
            data: {
              clientId,
              label: `SIP ${f.extension || f.sipUsername || ""}`.trim().slice(0, 200) || "SIP credential",
              username: f.sipUsername || f.extension || null,
              encryptedPassword: encrypt(String(f.sipPassword)),
              dataSource: "NOTES_INTAKE",
            },
          })
          credId = c.id
          summary.credentials.push(c.id)
        }
        if (!ps) {
          if (!credId) summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "client has no phone system — SIP saved to vault only if a password was present" })
          continue
        }
        const ext = await prisma.phoneExtension.create({
          data: {
            systemId: ps.id,
            extension: (f.extension || "?").toString().slice(0, 20),
            displayName: (f.displayName || e.summary || "Imported").toString().slice(0, 200),
            did: f.did || null,
            credentialId: credId,
            notes: f.notes || null,
          },
        })
        summary.phoneExtensions.push(ext.id)
      } else {
        summary.skipped.push({ kind: e.kind, summary: e.summary, reason: "informational — not written as a record" })
      }
    } catch (err: any) {
      summary.skipped.push({ kind: e.kind, summary: e.summary, reason: `write error: ${err?.message || err}` })
    }
  }

  await writeActivity({
    clientId,
    staffUserId: staffUserId ?? null,
    eventType: "TECH_NOTE",
    title: "Imported from Apple Notes intake",
    body: `From note "${noteTitle}": created ${summary.credentials.length} credential(s), ${summary.assets.length} asset(s), ${summary.phoneExtensions.length} phone extension(s); updated ${summary.updated.length} existing record(s)${summary.locationUpdated ? "; location updated" : ""}.`,
  })

  return summary
}
