import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { normalizeMac, normalizeSerial } from "@/lib/asset-identity"

export type DuplicateAsset = {
  id: string
  name: string
  friendlyName: string | null
  make: string | null
  model: string | null
  serial: string | null
  macAddress: string | null
  ipAddress: string | null
  dataSource: string
  syncroAssetId: string | null
  createdAt: string
  updatedAt: string
}

export type DuplicateGroup = {
  /** "serial" or "mac" — what the assets share */
  matchOn: "serial" | "mac"
  /** the normalised value they share */
  key: string
  assets: DuplicateAsset[]
}

/**
 * Read-only: ACTIVE assets of this client that share a normalised serial or
 * MAC (placeholder serials like "To be filled by O.E.M." are ignored). Groups
 * are merged so an asset pair matching on BOTH serial and MAC shows once
 * (as a serial group).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }

  try {
    const rows = await prisma.asset.findMany({
      where: {
        location: { clientId: id },
        status: "ACTIVE",
        OR: [{ serial: { not: null } }, { macAddress: { not: null } }],
      },
      select: {
        id: true, name: true, friendlyName: true, make: true, model: true,
        serial: true, macAddress: true, ipAddress: true, dataSource: true,
        syncroAssetId: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    })

    const bySerial = new Map<string, typeof rows>()
    const byMac = new Map<string, typeof rows>()
    for (const r of rows) {
      const s = normalizeSerial(r.serial)
      if (s) bySerial.set(s, [...(bySerial.get(s) ?? []), r])
      const m = normalizeMac(r.macAddress)
      if (m) byMac.set(m, [...(byMac.get(m) ?? []), r])
    }

    const groups: DuplicateGroup[] = []
    const seenSets = new Set<string>()
    const push = (matchOn: "serial" | "mac", key: string, list: typeof rows) => {
      if (list.length < 2) return
      const sig = list.map((a) => a.id).sort().join(",")
      if (seenSets.has(sig)) return
      seenSets.add(sig)
      groups.push({
        matchOn,
        key,
        assets: list.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      })
    }
    for (const [k, list] of bySerial) push("serial", k, list)
    for (const [k, list] of byMac) push("mac", k, list)

    return NextResponse.json({ groups, total: groups.length })
  } catch (e) {
    console.error("[asset-duplicates]", e)
    return NextResponse.json({ error: "Failed to load duplicates" }, { status: 500 })
  }
}
