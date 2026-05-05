import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { callTickethubBff, BffCallError } from "@/lib/bff-th-client"

export const dynamic = "force-dynamic"

/**
 * POST /api/identity/connect   { clientName }
 *
 * Returns the admin-consent URL the staff member hands to the client's
 * global admin. ADMIN role only — initiating a tenant connection is a
 * setup step that shouldn't be available to TECH/CLIENT roles.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 })
  }

  let body: { clientName?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }) }
  if (!body.clientName) return NextResponse.json({ error: "clientName required" }, { status: 400 })

  try {
    const data = await callTickethubBff<{ ok: boolean; url?: string; error?: string }>({
      path: `/api/bff/dh/identity/by-name/consent-url`,
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
