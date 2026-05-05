import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { callTickethubBff, BffCallError } from "@/lib/bff-th-client"

export const dynamic = "force-dynamic"

/**
 * POST /api/identity/contacts   { clientName }
 *
 * Returns `byEmail` map of every TH_Contact's identity link, so the
 * People tab can decorate each Person row with a "Linked: <upn>" badge
 * without making per-person fetches.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { clientName?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }) }
  if (!body.clientName) return NextResponse.json({ error: "clientName required" }, { status: 400 })

  try {
    const data = await callTickethubBff({
      path: `/api/bff/dh/identity/by-name/contacts`,
      body: { clientName: body.clientName },
    })
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof BffCallError) {
      return NextResponse.json({ ok: false, error: "TicketHub returned an error", payload: e.payload }, { status: e.status })
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
