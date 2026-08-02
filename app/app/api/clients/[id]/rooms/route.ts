import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * Distinct room names already in use for a client, for capture-time autocomplete.
 *
 * Unions both places rooms live today: Asset.room (free text, in use since long
 * before this feature) and CableRun.room. Autocompleting from the union is the
 * cheapest available defence against the drift already visible in the data —
 * "Upstairs Rack" vs "Upstairs rack tire and auto" at only 11 populated rows.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId } = await params
    const scope = await getClientScope()
    if (!scopeAllows(scope, clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const [fromAssets, fromRuns] = await Promise.all([
      prisma.asset.findMany({
        where: { location: { clientId }, room: { not: null } },
        select: { room: true },
        distinct: ["room"],
      }),
      prisma.cableRun.findMany({
        where: { clientId, room: { not: null } },
        select: { room: true },
        distinct: ["room"],
      }),
    ])

    // Case-insensitive dedupe, first spelling wins, alphabetical.
    const seen = new Map<string, string>()
    for (const r of [...fromAssets, ...fromRuns]) {
      const v = r.room?.trim()
      if (!v) continue
      const k = v.toLowerCase()
      if (!seen.has(k)) seen.set(k, v)
    }
    return NextResponse.json([...seen.values()].sort((a, b) => a.localeCompare(b)))
  } catch {
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 })
  }
}
