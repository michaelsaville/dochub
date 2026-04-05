import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { unifiLogin, unifiGetSites, unifiLogout } from "@/lib/unifi"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const keys = ["integration:unifi:url", "integration:unifi:username", "integration:unifi:password", "integration:unifi:controllerType"]
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const url = cfg["integration:unifi:url"]?.trim()
    const username = cfg["integration:unifi:username"]?.trim()
    const password = cfg["integration:unifi:password"]?.trim()
    const controllerType = (cfg["integration:unifi:controllerType"] || "unifi_os") as "network_application" | "unifi_os"

    if (!url || !username || !password) {
      return NextResponse.json({ error: "Unifi credentials not configured" }, { status: 422 })
    }

    const { cookies, csrfToken } = await unifiLogin({ url, username, password, controllerType })
    const sites = await unifiGetSites({ url, username, password, controllerType }, cookies, csrfToken)
    await unifiLogout({ url, username, password, controllerType }, cookies, csrfToken)

    return NextResponse.json(sites)
  } catch (e: any) {
    return NextResponse.json({ error: `Unifi connection failed: ${e.message}` }, { status: 500 })
  }
}
