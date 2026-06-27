import { NextResponse } from "next/server"
import { recordSyncStatus, type SyncStatus } from "@/lib/sync-status"
import { requireCronSecret } from "@/lib/cron-auth"

/**
 * Map an integration JSON result to a sync status row. Each sub-cron
 * varies in shape, so look at common signals: explicit `success: false`,
 * `error` field, "Unauthorized" / "skipped" strings.
 */
function classifyResult(result: any): { status: SyncStatus; message: string | null } {
  if (!result) return { status: "ERROR", message: "No response" }
  if (result.success === false) {
    return { status: "ERROR", message: result.error ?? "Unknown error" }
  }
  if (result.error) {
    const lower = String(result.error).toLowerCase()
    if (lower.includes("unauthorized") || lower.includes("401")) {
      return { status: "ERROR", message: result.error }
    }
    if (
      lower.includes("not configured") ||
      lower.includes("skipped") ||
      lower.includes("required") ||
      lower.includes("mapped") ||
      lower.includes("configured")
    ) {
      return { status: "UNCONFIGURED", message: result.error }
    }
    return { status: "ERROR", message: result.error }
  }
  if (result.skipped) {
    return { status: "UNCONFIGURED", message: String(result.skipped) }
  }
  return { status: "OK", message: null }
}

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const results: Record<string, any> = {}

  try {
    const res = await fetch("http://localhost:3000/api/sync/syncro", { method: "POST" })
    results.syncro = await res.json()
  } catch (e: any) {
    results.syncro = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/cron/domains", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.domains = await res.json()
  } catch (e: any) {
    results.domains = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/cron/alerts", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.alerts = await res.json()
  } catch (e: any) {
    results.alerts = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/cron/synology", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.synology = await res.json()
  } catch (e: any) {
    results.synology = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/integrations/unifi/sync-local", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.unifiLocal = await res.json()
  } catch (e: any) {
    results.unifiLocal = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/cron/uptime", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.uptime = await res.json()
  } catch (e: any) {
    results.uptime = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/cron/backup-verify", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.backupVerify = await res.json()
  } catch (e: any) {
    results.backupVerify = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/integrations/meraki/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.meraki = await res.json()
  } catch (e: any) {
    results.meraki = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/integrations/pax8/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.pax8 = await res.json()
  } catch (e: any) {
    results.pax8 = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/integrations/sonicwall/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.sonicwall = await res.json()
  } catch (e: any) {
    results.sonicwall = { success: false, error: e.message }
  }

  try {
    const res = await fetch("http://localhost:3000/api/integrations/unifi/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    results.unifiCloud = await res.json()
  } catch (e: any) {
    results.unifiCloud = { success: false, error: e.message }
  }

  // Persist per-integration status so Settings can render last-run + last-error.
  await Promise.all([
    recordSyncStatus("syncro",       ...statusFor(results.syncro)),
    recordSyncStatus("domains",      ...statusFor(results.domains)),
    recordSyncStatus("alerts",       ...statusFor(results.alerts)),
    recordSyncStatus("synology",     ...statusFor(results.synology)),
    recordSyncStatus("unifiLocal",   ...statusFor(results.unifiLocal)),
    recordSyncStatus("uptime",       ...statusFor(results.uptime)),
    recordSyncStatus("backupVerify", ...statusFor(results.backupVerify)),
    recordSyncStatus("meraki",       ...statusFor(results.meraki)),
    recordSyncStatus("pax8",         ...statusFor(results.pax8)),
    recordSyncStatus("sonicwall",    ...statusFor(results.sonicwall)),
    recordSyncStatus("unifiCloud",   ...statusFor(results.unifiCloud)),
  ])

  const success = results.syncro?.success !== false
  return NextResponse.json({ success, ...results })
}

function statusFor(r: any): [SyncStatus, string | null] {
  const c = classifyResult(r)
  return [c.status, c.message]
}
