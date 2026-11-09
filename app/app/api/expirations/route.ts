import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { getExpiryItems } from "@/lib/expiry-feed"

// GET /api/expirations
//   ?clientId=          one client
//   ?pastDays=N         only items that expired at most N days ago   (e.g. 30)
//   ?nextDays=N         only items expiring within the next N days   (e.g. 60)
//   ?includeStale=1     also return items expired > 90 days ago (stale:true,
//                       informational — excluded by default)
//   ?sort=nearest       order by |expiresAt − now| (dashboard); default = date asc
// Returns an array (unchanged shape) + a `stale` flag per item.
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId") || undefined
  const scope = await getClientScope()
  if (clientId && !scopeAllows(scope, clientId)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }

  const num = (k: string) => {
    const v = url.searchParams.get(k)
    if (v == null || v === "") return undefined
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }
  const pastDays = num("pastDays")
  const nextDays = num("nextDays")
  const now = Date.now()

  const raw = await getExpiryItems({
    clientId,
    scope,
    from: pastDays != null ? new Date(now - pastDays * 86_400_000) : undefined,
    to: nextDays != null ? new Date(now + nextDays * 86_400_000) : undefined,
  })
  const includeStale = url.searchParams.get("includeStale") === "1"
  const kept = includeStale ? raw : raw.filter(i => !i.stale)

  const nearest = url.searchParams.get("sort") === "nearest"
  kept.sort((a, b) => nearest
    ? Math.abs(a.expiresAt.getTime() - now) - Math.abs(b.expiresAt.getTime() - now)
    : a.expiresAt.getTime() - b.expiresAt.getTime())

  return NextResponse.json(kept.map(i => ({ ...i, expiresAt: i.expiresAt.toISOString() })))
}
