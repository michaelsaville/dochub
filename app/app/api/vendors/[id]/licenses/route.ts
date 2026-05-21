import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// POST { childIds: string[] } — set License.vendorId = id for each.
// Vendor is multi-client by nature; no same-client scope check applies.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const childIds: string[] = Array.isArray(body?.childIds) ? body.childIds : (body?.childId ? [body.childId] : [])
    if (childIds.length === 0) return NextResponse.json({ error: "childIds required" }, { status: 400 })
    const vendor = await prisma.vendor.findUnique({ where: { id }, select: { id: true } })
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 })
    const results: { id: string; status: "linked" | "skipped" | "error"; reason?: string }[] = []
    for (const cid of childIds) {
      try {
        const existing = await prisma.license.findUnique({ where: { id: cid }, select: { vendorId: true } })
        if (!existing) { results.push({ id: cid, status: "error", reason: "license not found" }); continue }
        if (existing.vendorId === id) { results.push({ id: cid, status: "skipped", reason: "already linked" }); continue }
        await prisma.license.update({ where: { id: cid }, data: { vendorId: id } })
        results.push({ id: cid, status: "linked" })
      } catch (e: any) {
        results.push({ id: cid, status: "error", reason: String(e?.message ?? e) })
      }
    }
    return NextResponse.json({ results })
  } catch (e) {
    console.error("[api/vendors/:id/licenses POST]", e)
    return NextResponse.json({ error: "Failed to link" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const url = new URL(req.url)
    const childId = url.searchParams.get("childId")
    if (!childId) return NextResponse.json({ error: "childId required" }, { status: 400 })
    const row = await prisma.license.findUnique({ where: { id: childId }, select: { vendorId: true } })
    if (!row || row.vendorId !== id) return NextResponse.json({ error: "Not linked" }, { status: 404 })
    await prisma.license.update({ where: { id: childId }, data: { vendorId: null } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[api/vendors/:id/licenses DELETE]", e)
    return NextResponse.json({ error: "Failed to unlink" }, { status: 500 })
  }
}
