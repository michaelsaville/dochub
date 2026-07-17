import { NextResponse } from "next/server"
import { requireCronSecret } from "@/lib/cron-auth"
import { verifyAuditChain, writeAudit } from "@/lib/audit-log"
import { setSetting } from "@/lib/settings"

export const dynamic = "force-dynamic"

// Nightly tamper check: re-walk the audit hash chain. On ✗ it raises an
// AppSetting flag (audit:verify:failed) and appends an "audit.verify.failed"
// event to the chain so the failure is itself recorded. On ✓ it clears the
// flag and stamps the last-good time. Cron-secret gated (fails closed).
async function run(req: Request): Promise<NextResponse> {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const result = await verifyAuditChain()
  const at = new Date().toISOString()

  if (!result.ok) {
    await setSetting(
      "audit:verify:failed",
      JSON.stringify({ at, brokenSeq: result.brokenSeq ?? null, brokenAt: result.brokenAt ?? null, checked: result.checked }),
    )
    await writeAudit({
      action: "audit.verify.failed",
      actorType: "SYSTEM",
      actorLabel: "cron",
      entityType: "auditLog",
      entityId: result.brokenAt ?? null,
      summary: `Audit chain verification FAILED at seq ${result.brokenSeq ?? "?"} (checked ${result.checked})`,
      metadata: { brokenSeq: result.brokenSeq ?? null, brokenAt: result.brokenAt ?? null, checked: result.checked },
    })
  } else {
    await setSetting("audit:verify:failed", "false")
    await setSetting("audit:verify:lastOk", at)
  }

  return NextResponse.json({
    ok: result.ok,
    checked: result.checked,
    brokenSeq: result.brokenSeq ?? null,
    at,
  })
}

export const GET = run
export const POST = run
