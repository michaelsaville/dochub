/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"

// POST /api/clients/merge — merge a duplicate client into another.
//   body: { sourceId, targetId, confirm?: "MERGE" }
// Dry-run (no confirm) returns per-table row counts that WOULD move. With
// confirm:"MERGE" it reassigns every table that has a clientId column (plus
// NoteSuggestion.matchedClientId) from source → target in one transaction, then
// deactivates the source client. Reassigns only — nothing is deleted. If a
// unique constraint would collide, the whole transaction rolls back untouched.
export async function POST(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const body = (await req.json().catch(() => ({}))) as any
  const sourceId: string = body.sourceId
  const targetId: string = body.targetId
  if (!sourceId || !targetId || sourceId === targetId) {
    return NextResponse.json({ error: "Pick two different clients" }, { status: 400 })
  }
  const [source, target] = await Promise.all([
    prisma.client.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
    prisma.client.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
  ])
  if (!source || !target) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  // Discover every table with a clientId column (excludes the Client PK itself).
  const cols = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'clientId'`
  const tables = cols.map((c) => c.table_name).filter((t) => t !== "Client")

  // Preview counts.
  const preview: Record<string, number> = {}
  for (const t of tables) {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "${t}" WHERE "clientId" = $1`, sourceId)
    const n = Number(rows[0]?.n || 0)
    if (n > 0) preview[t] = n
  }
  const nsRows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "NoteSuggestion" WHERE "matchedClientId" = $1`, sourceId)
  const nsCount = Number(nsRows[0]?.n || 0)
  if (nsCount > 0) preview["NoteSuggestion.matchedClientId"] = nsCount

  if (body.confirm !== "MERGE") {
    return NextResponse.json({ dryRun: true, source, target, wouldMove: preview, tables })
  }

  // Apply — one transaction; any collision rolls the whole thing back.
  let moved = 0
  try {
    await prisma.$transaction(async (tx) => {
      for (const t of tables) {
        moved += await tx.$executeRawUnsafe(`UPDATE "${t}" SET "clientId" = $1 WHERE "clientId" = $2`, targetId, sourceId)
      }
      await tx.$executeRawUnsafe(`UPDATE "NoteSuggestion" SET "matchedClientId" = $1 WHERE "matchedClientId" = $2`, targetId, sourceId)
      await tx.$executeRawUnsafe(`UPDATE "ClientAlias" SET "clientId" = $1, "clientName" = $3 WHERE "clientId" = $2`, targetId, sourceId, target.name)
      await tx.client.update({ where: { id: sourceId }, data: { isActive: false, name: `${source.name} (merged → ${target.name})` } })
    }, { timeout: 60_000 })
  } catch (err: any) {
    return NextResponse.json({ error: `Merge rolled back (nothing changed): ${err?.message || err}` }, { status: 409 })
  }

  await writeActivity({
    clientId: targetId, staffUserId: (session?.user as any)?.id ?? null, eventType: "TECH_NOTE",
    title: "Client merged in", body: `Merged "${source.name}" into this client (${moved} records reassigned). Source deactivated.`,
  })

  return NextResponse.json({ merged: true, moved, source, target })
}
