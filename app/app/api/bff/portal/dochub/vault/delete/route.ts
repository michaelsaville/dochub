import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  id: string
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
}

export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const p = r.body

  if (!p.id || !p.clientId || !p.portalUserId) {
    return NextResponse.json(
      { ok: false, error: "id, clientId, portalUserId required" },
      { status: 400 },
    )
  }

  const item = await prisma.portalCredential.findFirst({
    where: { id: p.id, clientId: p.clientId },
  })
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  const editable =
    item.ownedByUserId === p.portalUserId || !!p.isPortalOwner
  if (!editable) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 })
  }

  await prisma.portalCredential.delete({ where: { id: p.id } })
  return NextResponse.json({ ok: true })
}
