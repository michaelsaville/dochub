import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { breezeConfigured, BreezeError } from "@/lib/breeze"
import { runBreezeSync } from "@/lib/breeze-sync"

/**
 * POST /api/integrations/breeze/sync[?dryRun=1]
 * Nightly (Bearer CRON_SECRET via /api/cron/sync) or an ADMIN's "Sync now".
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization")
  const isCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const { error } = await requireAuth("ADMIN")
    if (error) return error
  }
  if (!breezeConfigured()) return NextResponse.json({ success: false, skipped: "Breeze not configured (BREEZE_API_KEY)" })
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"
  try {
    return NextResponse.json(await runBreezeSync({ dryRun }))
  } catch (e) {
    const msg = e instanceof BreezeError ? e.message : `Breeze sync failed: ${e instanceof Error ? e.message : String(e)}`
    return NextResponse.json({ success: false, error: msg }, { status: e instanceof BreezeError && e.status ? 502 : 500 })
  }
}
