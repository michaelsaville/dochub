import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { decrypt } from "@/lib/crypto"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import https from "https"
import http from "http"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"

function request(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; buffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === "https:"
    const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? "443" : "80"),
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
      agent,
    }
    const chunks: Buffer[] = []
    const req = (isHttps ? https : http).request(reqOptions, res => {
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | string[] | undefined>, buffer: Buffer.concat(chunks) })
      )
    })
    req.on("error", reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function unifiSnapshot(
  baseUrl: string,
  username: string,
  password: string,
  unifiCameraId: string
): Promise<Buffer> {
  // Strip trailing slash
  const base = baseUrl.replace(/\/$/, "")

  // Authenticate
  const loginRes = await request(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (loginRes.status !== 200) {
    throw new Error(`UniFi auth failed: HTTP ${loginRes.status}`)
  }

  // Extract cookies
  const setCookie = loginRes.headers["set-cookie"]
  const cookies = Array.isArray(setCookie)
    ? setCookie.map(c => c.split(";")[0]).join("; ")
    : (setCookie ?? "").split(";")[0]

  if (!cookies) throw new Error("UniFi auth returned no session cookie")

  // Fetch snapshot
  const snapRes = await request(
    `${base}/proxy/protect/api/cameras/${unifiCameraId}/snapshot`,
    { headers: { Cookie: cookies } }
  )
  if (snapRes.status !== 200) {
    throw new Error(`UniFi snapshot failed: HTTP ${snapRes.status}`)
  }

  return snapRes.buffer
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    const system = await prisma.cameraSystem.findUnique({
      where: { id },
      include: {
        credential: { select: { username: true, encryptedPassword: true } },
        cameras: { where: { unifiCameraId: { not: null } } },
      },
    })
    if (!system) return NextResponse.json({ error: "System not found" }, { status: 404 })
    if (system.type !== "UNIFI_NVR") return NextResponse.json({ error: "Not a UniFi NVR system" }, { status: 400 })
    if (!system.managementUrl) return NextResponse.json({ error: "No management URL configured" }, { status: 400 })
    if (!system.credential?.username || !system.credential?.encryptedPassword) {
      return NextResponse.json({ error: "No credential configured for this system" }, { status: 400 })
    }

    const username = system.credential.username
    const password = decrypt(system.credential.encryptedPassword)

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    const results: { cameraId: string; name: string; success: boolean; error?: string }[] = []

    for (const cam of system.cameras) {
      if (!cam.unifiCameraId) continue
      try {
        const imageBuffer = await unifiSnapshot(system.managementUrl, username, password, cam.unifiCameraId)
        const storageName = `cam-photo-${crypto.randomUUID()}.jpg`
        await writeFile(path.join(UPLOAD_DIR, storageName), imageBuffer)
        await prisma.camera.update({
          where: { id: cam.id },
          data: { photoStorageName: storageName, photoRefreshedAt: new Date() },
        })
        results.push({ cameraId: cam.id, name: cam.name, success: true })
      } catch (e) {
        results.push({ cameraId: cam.id, name: cam.name, success: false, error: (e as Error).message })
      }
    }

    return NextResponse.json({ synced: results.filter(r => r.success).length, total: results.length, results })
  } catch (e) {
    console.error("UniFi sync error:", e)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}
