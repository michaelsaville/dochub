import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { isIpv4 } from "@/lib/cidr"

/**
 * POST /api/assets/merge  { keepId, mergeIds: string[], dryRun?: boolean }   (ADMIN)
 *
 * Folds duplicate asset rows (e.g. an ITFlow import + a Syncro row for the same
 * PC) into one. In a single transaction:
 *   1. every foreign key that points at a merged asset is repointed to keepId —
 *      discovered from pg_constraint at runtime, so tables added on other
 *      branches (cabling, device ports…) are covered too;
 *   2. soft references (FlexAssetRelation target, IntakeSuggestion) follow;
 *   3. empty fields on the kept asset are filled from the merged ones (never
 *      overwriting a non-empty value); syncroAssetId moves across if the kept
 *      row has none, so the Syncro sync keeps matching the survivor;
 *   4. merged rows are RETIRED (not deleted) with a note pointing at the
 *      survivor, their MAC + Syncro id cleared so no sync re-matches them.
 * A unique-constraint clash (e.g. both rows have port 1 on a switch panel)
 * aborts the whole merge and reports which table — nothing half-applies.
 */

const FILLABLE = [
  "friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "vlan", "switchPort",
  "managementUrl", "splashtopUrl", "driverUrl", "purchaseDate", "warrantyExpiry", "room", "firmwareVersion",
  "portCount", "os", "ram", "cpu", "storageCapacity", "assetTypeId", "personId", "purchaseVendorId",
] as const

const isEmpty = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && (v.trim() === "" || /^unknown( make\/model)?$/i.test(v.trim())))

type FkRow = { tbl: string; col: string }

export async function POST(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error
  const body = await req.json().catch(() => ({}))
  const keepId: string = typeof body.keepId === "string" ? body.keepId : ""
  const mergeIds: string[] = Array.isArray(body.mergeIds) ? body.mergeIds.filter((x: unknown) => typeof x === "string" && x !== keepId) : []
  const dryRun = body.dryRun === true
  if (!keepId || mergeIds.length === 0) return NextResponse.json({ error: "keepId and mergeIds[] required" }, { status: 400 })
  if (mergeIds.length > 10) return NextResponse.json({ error: "Merge at most 10 at a time" }, { status: 400 })

  const all = await prisma.asset.findMany({
    where: { id: { in: [keepId, ...mergeIds] } },
    include: { location: { select: { clientId: true } } },
  })
  const keep = all.find((a) => a.id === keepId)
  const merging = all.filter((a) => a.id !== keepId)
  if (!keep || merging.length !== mergeIds.length) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  const clientId = keep.location.clientId
  if (merging.some((a) => a.location.clientId !== clientId)) {
    return NextResponse.json({ error: "Assets belong to different clients" }, { status: 400 })
  }
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  // Every FK column in the DB that references "Asset"(id).
  const fks = await prisma.$queryRaw<FkRow[]>`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = '"Asset"'::regclass`

  // Field fill plan
  const fill: Record<string, unknown> = {}
  for (const f of FILLABLE) {
    if (!isEmpty((keep as Record<string, unknown>)[f])) continue
    const donor = merging.find((m) => {
      const v = (m as Record<string, unknown>)[f]
      if (isEmpty(v)) return false
      // Imports stuffed URLs / agent links into ipAddress — only carry real IPs.
      if (f === "ipAddress") return typeof v === "string" && (isIpv4(v.trim()) || /^[0-9a-f:]+$/i.test(v.trim()))
      return true
    })
    if (donor) fill[f] = (donor as Record<string, unknown>)[f]
  }
  const syncroDonor = !keep.syncroAssetId ? merging.find((m) => m.syncroAssetId) : undefined
  const mergedNotes = merging.map((m) => m.notes?.trim()).filter((n): n is string => !!n && n !== keep.notes?.trim())
  const notes = mergedNotes.length ? [keep.notes?.trim(), ...mergedNotes.map((n) => `— merged —\n${n}`)].filter(Boolean).join("\n\n") : undefined
  const favorite = !keep.isFavorite && merging.some((m) => m.isFavorite)

  // Count what will move (also the dry-run report)
  const moves: { table: string; column: string; rows: number }[] = []
  for (const fk of fks) {
    if (fk.tbl === '"Asset"' && fk.col === "successorId") continue // handled below
    const n = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM ${fk.tbl} WHERE "${fk.col.replace(/"/g, "")}" = ANY($1::text[])`,
      mergeIds,
    )
    const rows = Number(n[0]?.n ?? 0)
    if (rows) moves.push({ table: fk.tbl.replace(/"/g, ""), column: fk.col, rows })
  }

  if (dryRun) {
    return NextResponse.json({ dryRun: true, keepId, mergeIds, fill: Object.keys(fill), moveSyncroId: !!syncroDonor, moves })
  }

  const actor = session!.user?.name || session!.user?.email || "staff"
  const now = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      for (const fk of fks) {
        const col = fk.col.replace(/"/g, "")
        if (fk.tbl === '"Asset"' && col === "successorId") {
          // successorId is unique: only point at the survivor if nobody already does
          const already = await tx.asset.findFirst({ where: { successorId: keepId } })
          if (!already) {
            await tx.$executeRawUnsafe(`UPDATE "Asset" SET "successorId" = $1 WHERE "successorId" = ANY($2::text[]) AND id <> $1 AND id <> ALL($2::text[])`, keepId, mergeIds)
          }
          continue
        }
        // AssetLink rows between the two duplicates would become self-links — drop them.
        if (fk.tbl === '"AssetLink"') {
          await tx.$executeRawUnsafe(
            `DELETE FROM "AssetLink" WHERE ("assetId" = ANY($1::text[]) AND "linkedAssetId" = $2) OR ("linkedAssetId" = ANY($1::text[]) AND "assetId" = $2)`,
            mergeIds, keepId,
          )
        }
        await tx.$executeRawUnsafe(`UPDATE ${fk.tbl} SET "${col}" = $1 WHERE "${col}" = ANY($2::text[])`, keepId, mergeIds)
      }
      await tx.flexAssetRelation.updateMany({ where: { targetType: "Asset", targetId: { in: mergeIds } }, data: { targetId: keepId } })
      await tx.intakeSuggestion.updateMany({ where: { committedAssetId: { in: mergeIds } }, data: { committedAssetId: keepId } })

      // Free the unique syncroAssetId on the donor before giving it to the survivor.
      if (syncroDonor) await tx.asset.update({ where: { id: syncroDonor.id }, data: { syncroAssetId: null } })
      await tx.asset.update({
        where: { id: keepId },
        data: {
          ...(fill as Prisma.AssetUncheckedUpdateInput),
          ...(syncroDonor ? { syncroAssetId: syncroDonor.syncroAssetId, dataSource: "SYNCRO" } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(favorite ? { isFavorite: true } : {}),
        },
      })
      for (const m of merging) {
        await tx.asset.update({
          where: { id: m.id },
          data: {
            status: "RETIRED",
            syncroAssetId: null,
            macAddress: null,
            isFavorite: false,
            notes: [`Merged into "${keep.friendlyName || keep.name}" (${keepId}) by ${actor} on ${now.toISOString().slice(0, 10)}.`,
              m.macAddress ? `Original MAC: ${m.macAddress}` : null, m.syncroAssetId ? `Original Syncro id: ${m.syncroAssetId}` : null, m.notes]
              .filter(Boolean).join("\n"),
          },
        })
      }
      await tx.fieldHistory.createMany({
        data: [
          { entityType: "Asset", entityId: keepId, field: "merge", oldValue: null, newValue: `absorbed ${merging.map((m) => m.name).join(", ")}`, changedBy: actor },
          ...merging.map((m) => ({ entityType: "Asset", entityId: m.id, field: "merge", oldValue: m.status, newValue: `merged into ${keepId}`, changedBy: actor })),
        ],
      })
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const clash = /unique|duplicate key/i.test(msg)
    return NextResponse.json(
      { error: clash ? `Can't merge automatically: both assets have conflicting linked records (${msg.match(/"([A-Za-z]+)"/)?.[1] ?? "unique constraint"}). Nothing was changed.` : "Merge failed — nothing was changed.", detail: msg.slice(0, 300) },
      { status: 409 },
    )
  }

  await writeAudit({
    action: "asset.merge",
    actorType: "STAFF",
    actorId: (session!.user as { id?: string }).id ?? null,
    actorLabel: actor,
    entityType: "Asset",
    entityId: keepId,
    clientId,
    summary: `Merged ${merging.length} duplicate asset(s) into ${keep.friendlyName || keep.name}`,
    metadata: { mergeIds, filled: Object.keys(fill), movedSyncroId: !!syncroDonor, moves },
  })

  return NextResponse.json({ ok: true, keepId, mergeIds, filled: Object.keys(fill), moves })
}
