import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { verifyAuditChain } from "@/lib/audit-log"

export const dynamic = "force-dynamic"

// Re-walks the whole hash chain and reports ✓/✗ for the Secure-Log banner.
// Also surfaces the stored head pointer + whether the HMAC key is a real env
// secret ("keyed") vs the last-resort dev fallback ("unkeyed").
export async function GET() {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const [result, headHashRow, headSeqRow, last] = await Promise.all([
    verifyAuditChain(),
    prisma.appSetting.findUnique({ where: { key: "audit:head_hash" } }).catch(() => null),
    prisma.appSetting.findUnique({ where: { key: "audit:head_seq" } }).catch(() => null),
    prisma.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } }).catch(() => null),
  ])

  const keyed = Boolean(process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY)
  const headPointerMatches = !last || headHashRow?.value === last.hash

  return NextResponse.json({
    ok: result.ok,
    checked: result.checked,
    brokenAt: result.brokenAt ?? null,
    brokenSeq: result.brokenSeq ?? null,
    latestSeq: last ? last.seq.toString() : null,
    latestHash: last?.hash ?? null,
    headHash: headHashRow?.value ?? null,
    headSeqPointer: headSeqRow?.value ?? null,
    headPointerMatches,
    keyed,
    generatedAt: new Date().toISOString(),
  })
}
