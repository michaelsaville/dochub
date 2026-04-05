import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { unifiLogin, unifiGetSites, unifiLogout, uiCloudGetHosts } from "@/lib/unifi"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const keys = [
      "integration:unifi:url",
      "integration:unifi:username",
      "integration:unifi:password",
      "integration:unifi:controllerType",
      "integration:unifi:apiKey",
    ]
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const controllerType = (cfg["integration:unifi:controllerType"] || "unifi_os") as "network_application" | "unifi_os" | "ui_cloud"

    if (controllerType === "ui_cloud") {
      const apiKey = cfg["integration:unifi:apiKey"]?.trim()
      if (!apiKey) return NextResponse.json({ error: "UI.com API key not configured" }, { status: 422 })
      const hosts = await uiCloudGetHosts(apiKey)
      return NextResponse.json(hosts)
    }

    const url = cfg["integration:unifi:url"]?.trim()
    const username = cfg["integration:unifi:username"]?.trim()
    const password = cfg["integration:unifi:password"]?.trim()

    if (!url || !username || !password) {
      return NextResponse.json({ error: "Unifi credentials not configured" }, { status: 422 })
    }

    const unifiCfg = { url, username, password, controllerType }
    const { cookies, csrfToken } = await unifiLogin(unifiCfg)
    const sites = await unifiGetSites(unifiCfg, cookies, csrfToken)
    await unifiLogout(unifiCfg, cookies, csrfToken)

    return NextResponse.json(sites)
  } catch (e: any) {
    return NextResponse.json({ error: `Unifi connection failed: ${e.message}` }, { status: 500 })
  }
}
