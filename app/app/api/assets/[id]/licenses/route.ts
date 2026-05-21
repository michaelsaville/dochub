import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import {
  LinkScopeError,
  assertChildBelongsToClient,
  resolveAssetClient,
} from "@/lib/links/scope"

// POST { childIds: string[] } — set license.assetId = id for each.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const childIds: string[] = Array.isArray(body?.childIds) ? body.childIds : (body?.childId ? [body.childId] : [])
    if (childIds.length === 0) return NextResponse.json({ error: "childIds required" }, { status: 400 })
    const clientId = await resolveAssetClient(id)
    const results: { id: string; status: "linked" | "skipped" | "error"; reason?: string }[] = []
    for (const cid of childIds) {
      try {
        await assertChildBelongsToClient("license", cid, clientId)
        const before = await prisma.license.findUnique({ where: { id: cid }, select: { assetId: true } })
        if (before?.assetId === id) { results.push({ id: cid, status: "skipped", reason: "already linked" }); continue }
        await prisma.license.update({ where: { id: cid }, data: { assetId: id } })
        results.push({ id: cid, status: "linked" })
      } catch (e: any) {
        results.push({ id: cid, status: "error", reason: e instanceof LinkScopeError ? e.message : String(e?.message ?? e) })
      }
    }
    return NextResponse.json({ results })
  } catch (e: any) {
    if (e instanceof LinkScopeError) return NextResponse.json({ error: e.message }, { status: e.httpStatus })
    console.error("[api/assets/:id/licenses POST]", e)
    return NextResponse.json({ error: "Failed to link" }, { status: 500 })
  }
}

// DELETE ?childId= — null out license.assetId
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const url = new URL(req.url)
    const childId = url.searchParams.get("childId")
    if (!childId) return NextResponse.json({ error: "childId required" }, { status: 400 })
    const row = await prisma.license.findUnique({ where: { id: childId }, select: { assetId: true } })
    if (!row || row.assetId !== id) return NextResponse.json({ error: "Not linked" }, { status: 404 })
    await prisma.license.update({ where: { id: childId }, data: { assetId: null } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[api/assets/:id/licenses DELETE]", e)
    return NextResponse.json({ error: "Failed to unlink" }, { status: 500 })
  }
}
