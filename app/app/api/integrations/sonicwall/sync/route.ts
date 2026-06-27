import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { upsertNetworkAsset, loadAssetTypeMap } from "@/lib/network-asset"
import https from "node:https"

// SonicOS REST API v2 (firmware 6.5.4+)
// Each SonicWall is its own appliance with its own credentials.

type SonicwallDevice = {
  host: string       // e.g. https://192.168.1.1
  username: string
  password: string
  clientId: string   // DocHub client ID this device belongs to
  name?: string      // optional friendly name override
}

function httpsRequest(
  urlStr: string,
  method: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ data: any; status: number; rawHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const bodyStr = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(bodyStr ? { "Content-Length": String(Buffer.byteLength(bodyStr)) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = ""
        res.on("data", (c) => (raw += c))
        res.on("end", () => {
          let data: any
          try { data = JSON.parse(raw) } catch { data = raw }
          resolve({ data, status: res.statusCode ?? 0, rawHeaders: res.headers as any })
        })
      }
    )
    req.on("error", reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

async function sonicwallSync(device: SonicwallDevice) {
  // Step 1: Authenticate
  const authRes = await httpsRequest(
    `${device.host}/api/sonicos/auth`,
    "POST",
    { Authorization: `Basic ${Buffer.from(`${device.username}:${device.password}`).toString("base64")}` }
  )
  if (authRes.status !== 200) throw new Error(`Auth failed: HTTP ${authRes.status}`)

  // Extract auth cookie
  const setCookie = authRes.rawHeaders["set-cookie"]
  const cookies = Array.isArray(setCookie)
    ? setCookie.map((c: string) => c.split(";")[0]).join("; ")
    : setCookie?.split(";")?.[0] ?? ""

  try {
    // Step 2: Get version / device info
    const versionRes = await httpsRequest(
      `${device.host}/api/sonicos/config/version`,
      "GET",
      { Cookie: cookies }
    )
    const versionData = versionRes.data

    // Step 3: Get system info (serial, model)
    const sysRes = await httpsRequest(
      `${device.host}/api/sonicos/reporting/device/current`,
      "GET",
      { Cookie: cookies }
    )
    const sysData = sysRes.data

    // Parse what we can from the response
    const firmwareVersion =
      versionData?.firmware_version?.version_string ||
      versionData?.version ||
      null
    const model = sysData?.model || versionData?.model || null
    const serial = sysData?.serial_number || sysData?.serial || null
    const name = device.name || model || "SonicWall"

    return { firmwareVersion, model, serial, name }
  } finally {
    // Logout
    await httpsRequest(`${device.host}/api/sonicos/auth`, "DELETE", { Cookie: cookies }).catch(() => {})
  }
}

export async function POST(req: Request) {
  // Allow the nightly cron (Bearer CRON_SECRET) OR an authenticated session.
  const authHeader = req.headers.get("authorization")
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const { error } = await requireAuth()
    if (error) return error
  }
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "integration:sonicwall:devices" } })
    if (!row?.value) return NextResponse.json({ error: "No SonicWall devices configured" }, { status: 422 })

    const devices: SonicwallDevice[] = JSON.parse(row.value)
    if (!devices.length) return NextResponse.json({ error: "No SonicWall devices configured" }, { status: 422 })

    const typeByName = await loadAssetTypeMap()
    let totalDevices = 0
    const errors: string[] = []

    for (const device of devices) {
      try {
        const info = await sonicwallSync(device)

        const client = await prisma.client.findUnique({
          where: { id: device.clientId },
          include: { locations: { take: 1 } },
        })
        if (!client) { errors.push(`Client ${device.clientId} not found`); continue }

        await upsertNetworkAsset(
          device.clientId,
          client.locations[0]?.id || null,
          { serial: info.serial || null, managementUrl: device.host },
          {
            name: info.name,
            assetTypeId: typeByName["Firewall"] ?? null,
            make: "SonicWall",
            model: info.model,
            ipAddress: new URL(device.host).hostname,
            serial: info.serial,
            firmwareVersion: info.firmwareVersion,
            managementUrl: device.host,
          },
          "SONICWALL",
        )
        totalDevices++
      } catch (devErr: any) {
        errors.push(`${device.host}: ${devErr.message}`)
      }
    }

    return NextResponse.json({ success: true, devices: totalDevices, errors: errors.slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
