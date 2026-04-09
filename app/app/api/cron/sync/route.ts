import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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

  const success = results.syncro?.success !== false
  return NextResponse.json({ success, ...results })
}
