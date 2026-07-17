import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { verifyAuditChain, writeAudit } from "@/lib/audit-log"
import crypto from "crypto"

export const dynamic = "force-dynamic"

// SOC2 evidence export of the tamper-evident chain. Streams NDJSON (default)
// or CSV (?format=csv) of an optional seq range, PLUS a signed manifest
// {count, headHash, generatedAt, verified} — the manifest line is itself
// HMAC-signed so the exported file is self-verifying evidence. ADMIN-only.

function hmacKey(): string {
  return process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || "dochub-audit-hmac-fallback"
}

function sign(manifest: Record<string, unknown>): string {
  return crypto.createHmac("sha256", hmacKey()).update(JSON.stringify(manifest)).digest("hex")
}

function csvEscape(v: unknown): string {
  if (v == null) return ""
  const s = typeof v === "object" ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const url = new URL(req.url)
  const format = url.searchParams.get("format") === "csv" ? "csv" : "ndjson"
  const fromSeq = url.searchParams.get("fromSeq")
  const toSeq = url.searchParams.get("toSeq")

  const where: Record<string, unknown> = {}
  if (fromSeq || toSeq) {
    const range: Record<string, bigint> = {}
    try {
      if (fromSeq) range.gte = BigInt(fromSeq)
      if (toSeq) range.lte = BigInt(toSeq)
      where.seq = range
    } catch {
      /* ignore malformed range */
    }
  }

  const actorLabel = session?.user?.name ?? session?.user?.email ?? "unknown"

  // Record the evidence pull itself so the export is self-documenting.
  await writeAudit({
    action: "audit.evidence.export",
    actorType: "STAFF",
    actorId: (session?.user as { id?: string })?.id ?? null,
    actorLabel,
    entityType: "auditLog",
    summary: `Exported audit evidence (${format})`,
    metadata: { format, fromSeq: fromSeq ?? null, toSeq: toSeq ?? null },
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  })

  const [rows, verify, headRow] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { seq: "asc" } }),
    verifyAuditChain(),
    prisma.appSetting.findUnique({ where: { key: "audit:head_hash" } }).catch(() => null),
  ])

  const manifest = {
    kind: "dochub-audit-evidence",
    count: rows.length,
    seqRange: rows.length ? { from: rows[0].seq.toString(), to: rows[rows.length - 1].seq.toString() } : null,
    headHash: headRow?.value ?? null,
    verified: verify.ok,
    brokenSeq: verify.brokenSeq ?? null,
    checked: verify.checked,
    keyed: Boolean(process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY),
    generatedAt: new Date().toISOString(),
    generatedBy: actorLabel,
  }
  const signature = sign(manifest)
  const stamp = new Date().toISOString().slice(0, 10)

  const headers: Record<string, string> = {
    "Content-Disposition": `attachment; filename="dochub-audit-evidence-${stamp}.${format}"`,
    "Cache-Control": "private, no-store",
    "X-Audit-Manifest": Buffer.from(JSON.stringify(manifest)).toString("base64"),
    "X-Audit-Manifest-Signature": signature,
  }

  if (format === "csv") {
    const cols = [
      "seq", "at", "actorType", "actorId", "actorLabel", "action",
      "entityType", "entityId", "clientId", "summary", "ip", "userAgent",
      "prevHash", "hash", "metadata",
    ]
    const lines = [cols.join(",")]
    for (const r of rows) {
      lines.push([
        r.seq.toString(), r.at.toISOString(), r.actorType, r.actorId, r.actorLabel, r.action,
        r.entityType, r.entityId, r.clientId, r.summary, r.ip, r.userAgent,
        r.prevHash, r.hash, r.metadata,
      ].map(csvEscape).join(","))
    }
    return new NextResponse(lines.join("\n"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    })
  }

  // NDJSON: signed manifest as the first line, then one row per line.
  const out: string[] = [JSON.stringify({ _manifest: manifest, _signature: signature })]
  for (const r of rows) {
    out.push(JSON.stringify({
      seq: r.seq.toString(),
      id: r.id,
      at: r.at.toISOString(),
      actorType: r.actorType,
      actorId: r.actorId,
      actorLabel: r.actorLabel,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      clientId: r.clientId,
      summary: r.summary,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      prevHash: r.prevHash,
      hash: r.hash,
    }))
  }
  return new NextResponse(out.join("\n") + "\n", {
    headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" },
  })
}
