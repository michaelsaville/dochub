import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { breezeConfigured } from "@/lib/breeze"
import { undocumentedNetworkEquipment } from "@/lib/breeze-sync"

/**
 * GET /api/clients/:id/discovered
 *
 * Network gear Breeze has discovered at this client's sites (printers,
 * switches, firewalls, APs, NAS) that isn't documented yet, so a tech CONFIRMS
 * it into a prefilled asset. Agent-managed computers don't appear here — the
 * nightly Breeze sync creates/updates those automatically. (Replaced the
 * FleetHub feed, archived 2026-11-08.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const client = await prisma.client.findUnique({ where: { id }, select: { breezeOrgId: true } })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  if (!client.breezeOrgId || !breezeConfigured()) return NextResponse.json([])

  try {
    const items = await undocumentedNetworkEquipment(id, client.breezeOrgId)
    return NextResponse.json(items.map((e) => ({
      id: e.id,
      hostname: e.name,
      friendlyName: null,
      role: e.type.replace("_", " "),
      os: [e.manufacturer, e.model].filter(Boolean).join(" ") || null,
      osVersion: null,
      ipAddress: e.address,
      macAddress: e.macAddress,
      isOnline: true,
    })))
  } catch {
    return NextResponse.json([]) // Breeze unreachable — degrade quietly, never break the Assets tab
  }
}
