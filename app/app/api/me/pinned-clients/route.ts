import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * Per-staff pinned clients, stored server-side (AppSetting key
 * `user:<staffId>:pinnedClients`, JSON array of client ids) so pins follow
 * the tech between desktop, iPad and phone.
 */
const MAX_PINS = 15
const keyFor = (uid: string) => `user:${uid}:pinnedClients`

async function load(uid: string): Promise<string[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: keyFor(uid) } })
  try {
    const v = row ? JSON.parse(row.value) : []
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

async function withNames(ids: string[]) {
  if (!ids.length) return []
  const scope = await getClientScope()
  const rows = await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((r): r is { id: string; name: string } => !!r && scopeAllows(scope, r.id))
}

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error
  const uid = (session!.user as { id?: string }).id
  if (!uid) return NextResponse.json({ pinned: [] })
  return NextResponse.json({ pinned: await withNames(await load(uid)) })
}

// Body: { clientId, pinned: boolean }
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error
  const uid = (session!.user as { id?: string }).id
  if (!uid) return NextResponse.json({ error: "No staff id" }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const clientId = typeof body.clientId === "string" ? body.clientId : ""
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  let ids = (await load(uid)).filter((x) => x !== clientId)
  if (body.pinned) ids = [clientId, ...ids].slice(0, MAX_PINS)
  const value = JSON.stringify(ids)
  await prisma.appSetting.upsert({ where: { key: keyFor(uid) }, update: { value }, create: { key: keyFor(uid), value } })
  return NextResponse.json({ pinned: await withNames(ids) })
}
