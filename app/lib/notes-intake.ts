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
  fields?: Record<string, string | null | undefined>
}

export type CommitSummary = {
  credentials: string[]
  assets: string[]
  phoneExtensions: string[]
  locationUpdated: boolean
  skipped: { kind: string; summary?: string; reason: string }[]
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
    credentials: [], assets: [], phoneExtensions: [], locationUpdated: false, skipped: [],
  }

  for (const e of entities) {
    if (e.include === false) continue
    const f = e.fields || {}
    const label = (f.label || e.summary || "Imported").toString().slice(0, 200)

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
    body: `From note "${noteTitle}": ${summary.credentials.length} credential(s), ${summary.assets.length} asset(s), ${summary.phoneExtensions.length} phone extension(s)${summary.locationUpdated ? ", location updated" : ""}.`,
  })

  return summary
}
