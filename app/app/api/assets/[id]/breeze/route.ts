import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { breezeConfigured, liveStatuses, breezeDeviceUrl, breezeTerminalUrl } from "@/lib/breeze"

/** GET — live Breeze agent status + deep links for a Breeze-linked asset. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const a = await prisma.asset.findUnique({ where: { id }, select: { breezeDeviceId: true, lastSeenAt: true, location: { select: { clientId: true } } } })
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!scopeAllows(await getClientScope(), a.location.clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  if (!a.breezeDeviceId) return NextResponse.json({ linked: false })
  const links = { deviceUrl: breezeDeviceUrl(a.breezeDeviceId), terminalUrl: breezeTerminalUrl(a.breezeDeviceId) }
  if (!breezeConfigured()) return NextResponse.json({ linked: true, status: null, lastSeenAt: a.lastSeenAt, ...links })
  try {
    const s = (await liveStatuses()).get(a.breezeDeviceId)
    return NextResponse.json({ linked: true, status: s?.status ?? "unknown", lastSeenAt: s?.lastSeenAt ?? a.lastSeenAt, ...links })
  } catch {
    return NextResponse.json({ linked: true, status: null, lastSeenAt: a.lastSeenAt, ...links })
  }
}
