/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { writeAudit } from "@/lib/audit-log"
import { writeActivity } from "@/lib/activity"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { openJson } from "./secrets"

// Applies a human-approved AgentProposal. The payload comes ONLY from the sealed
// row written when the model proposed it — never from the request body or the
// model — so what the operator saw on the card is what gets written.

export const ASSET_FIELDS = ["name", "category", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "room", "os", "firmwareVersion", "friendlyName"] as const
export const ASSET_CATEGORIES = ["NETWORK_GEAR", "WIRELESS", "SERVER", "NAS", "COMPUTER", "LAPTOP", "TABLET", "PRINTER", "PHONE_SYSTEM", "PHONE_ENDPOINT", "WEBSITE", "VPN", "OTHER"]

export function writesEnabled(): boolean {
  const v = process.env.NOTES_INTAKE_WRITES
  return v === "true" || v === "1"
}

type Actor = { id: string | null; email: string | null }

export async function applyProposal(proposalId: string, actor: Actor, edits?: Record<string, string>) {
  if (!writesEnabled()) throw new Error("Writes are disabled (NOTES_INTAKE_WRITES)")
  const p = await prisma.agentProposal.findUnique({ where: { id: proposalId }, include: { conversation: true } })
  if (!p) throw new Error("Proposal not found")
  if (p.status !== "PROPOSED" && p.status !== "FAILED") throw new Error(`Proposal already ${p.status.toLowerCase()}`)
  if (p.conversation.staffUserId !== actor.id) throw new Error("Not your conversation")
  const scope = await getClientScope()
  if (!scopeAllows(scope, p.clientId)) throw new Error("Client is outside your access scope")

  const payload = openJson<any>(p.payloadSealed, null)
  if (!payload) throw new Error("Proposal payload unreadable")
  // Operator inline edits (non-secret fields only; secrets are edited by re-proposing).
  if (edits) {
    for (const [k, v] of Object.entries(edits)) {
      if (k === "password") continue
      if (p.kind === "asset_update") payload.patch[k] = v
      else payload[k] = v
    }
  }

  let result: any
  try {
    result = await prisma.$transaction(async (tx) => {
      // claim it (guards double-click / two tabs)
      const claimed = await tx.agentProposal.updateMany({ where: { id: p.id, status: { in: ["PROPOSED", "FAILED"] } }, data: { status: "APPLYING" } })
      if (claimed.count !== 1) throw new Error("Proposal is being applied elsewhere")

      if (p.kind === "asset_create") {
        const loc = await tx.location.findFirst({ where: { id: payload.locationId, clientId: p.clientId, isActive: true }, select: { id: true } })
        if (!loc) throw new Error("Location not found for this client")
        const a = await tx.asset.create({
          data: {
            locationId: loc.id,
            name: String(payload.name || "Imported asset").slice(0, 200),
            category: (ASSET_CATEGORIES.includes(payload.category) ? payload.category : "OTHER") as any,
            make: payload.make || null, model: payload.model || null, serial: payload.serial || null,
            assetTag: payload.assetTag || null, ipAddress: payload.ipAddress || null, macAddress: payload.macAddress || null,
            managementUrl: payload.managementUrl || null, room: payload.room || null, os: payload.os || null,
            firmwareVersion: payload.firmwareVersion || null, friendlyName: payload.friendlyName || null,
            notes: payload.notes || null, dataSource: "NOTES_INTAKE",
          },
          select: { id: true, name: true },
        })
        return { type: "asset", id: a.id, label: a.name, action: "created" }
      }

      if (p.kind === "asset_update") {
        const a = await tx.asset.findFirst({ where: { id: p.targetId!, location: { clientId: p.clientId } } })
        if (!a) throw new Error("Asset not found for this client")
        const data: any = {}
        for (const [k, v] of Object.entries(payload.patch || {})) {
          if (!(ASSET_FIELDS as readonly string[]).includes(k)) continue
          if (k === "category" && !ASSET_CATEGORIES.includes(String(v))) continue
          data[k] = v === "" ? null : v
        }
        if (payload.locationId && payload.locationId !== a.locationId) {
          const loc = await tx.location.findFirst({ where: { id: payload.locationId, clientId: p.clientId }, select: { id: true } })
          if (loc) data.locationId = loc.id
        }
        if (payload.appendNotes) data.notes = (a.notes ? a.notes + "\n" : "") + `[Pile agent ${new Date().toISOString().slice(0, 10)}] ${payload.appendNotes}`
        if (!Object.keys(data).length) throw new Error("Nothing to change")
        await tx.asset.update({ where: { id: a.id }, data })
        return { type: "asset", id: a.id, label: a.name, action: "updated", fields: Object.keys(data) }
      }

      if (p.kind === "credential_create") {
        if (!payload.password) throw new Error("No password to store")
        if (payload.assetId) {
          const a = await tx.asset.findFirst({ where: { id: payload.assetId, location: { clientId: p.clientId } }, select: { id: true } })
          if (!a) throw new Error("Linked asset not found for this client")
        }
        const c = await tx.credential.create({
          data: {
            clientId: p.clientId,
            assetId: payload.assetId || null,
            label: String(payload.label || "Imported login").slice(0, 200),
            username: payload.username || null,
            encryptedPassword: encrypt(String(payload.password)),
            url: payload.url || null,
            notes: payload.notes || null,
            dataSource: "NOTES_INTAKE",
          },
          select: { id: true, label: true },
        })
        return { type: "credential", id: c.id, label: c.label, action: "created" }
      }

      throw new Error(`Unknown proposal kind ${p.kind}`)
    })
  } catch (err: any) {
    await prisma.agentProposal.update({ where: { id: p.id }, data: { status: "FAILED", error: String(err?.message || err).slice(0, 500) } })
    throw err
  }

  await prisma.agentProposal.update({
    where: { id: p.id },
    data: { status: "APPLIED", resultJson: result, error: null, decidedBy: actor.email, decidedAt: new Date() },
  })

  await writeAudit({
    action: `agent.apply.${p.kind}`,
    actorType: "STAFF",
    actorId: actor.id,
    actorLabel: actor.email || "staff",
    entityType: result.type,
    entityId: result.id,
    clientId: p.clientId,
    summary: `${result.action} ${result.type} "${result.label}" via pile agent`,
    metadata: { via: "agent", conversationId: p.conversationId, proposalId: p.id, sourceSuggestionId: p.suggestionId, fields: result.fields },
  })
  await writeActivity({
    clientId: p.clientId,
    staffUserId: actor.id,
    eventType: "TECH_NOTE",
    title: `Pile agent: ${result.action} ${result.type}`,
    body: `${result.label} (approved from notes backlog)`,
  }).catch(() => {})

  return result
}

export async function rejectProposal(proposalId: string, actor: Actor, reason?: string) {
  const p = await prisma.agentProposal.findUnique({ where: { id: proposalId }, include: { conversation: true } })
  if (!p) throw new Error("Proposal not found")
  if (p.conversation.staffUserId !== actor.id) throw new Error("Not your conversation")
  if (p.status !== "PROPOSED" && p.status !== "FAILED") throw new Error(`Proposal already ${p.status.toLowerCase()}`)
  await prisma.agentProposal.update({
    where: { id: p.id },
    data: { status: "REJECTED", rejectReason: reason?.slice(0, 500) || null, decidedBy: actor.email, decidedAt: new Date() },
  })
  await writeAudit({
    action: "agent.reject",
    actorType: "STAFF", actorId: actor.id, actorLabel: actor.email || "staff",
    entityType: "agent_proposal", entityId: p.id, clientId: p.clientId,
    summary: `rejected ${p.kind} proposal`, metadata: { via: "agent", conversationId: p.conversationId, reason: reason || null },
  })
}
