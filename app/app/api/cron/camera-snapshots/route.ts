import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import https from "https"
import http from "http"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"

// Shared helper — duplicate avoided by keeping this file self-contained for the cron context
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

export async function GET(req: Request) {
  // Validate cron secret to prevent unauthorized triggering
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const systems = await prisma.cameraSystem.findMany({
    where: { type: "UNIFI_NVR", isActive: true, managementUrl: { not: null }, credentialId: { not: null } },
    include: {
      credential: { select: { username: true, encryptedPassword: true } },
      cameras: { where: { unifiCameraId: { not: null }, isActive: true } },
    },
  })

  let synced = 0
  let failed = 0

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

  for (const system of systems) {
    if (!system.managementUrl || !system.credential?.username || !system.credential?.encryptedPassword) continue

    const username = system.credential.username
    const password = decrypt(system.credential.encryptedPassword)
    const base = system.managementUrl.replace(/\/$/, "")

    // Authenticate once per system
    let cookies = ""
    try {
      const loginRes = await request(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (loginRes.status !== 200) { failed += system.cameras.length; continue }
      const setCookie = loginRes.headers["set-cookie"]
      cookies = Array.isArray(setCookie)
        ? setCookie.map(c => c.split(";")[0]).join("; ")
        : (setCookie ?? "").split(";")[0]
      if (!cookies) { failed += system.cameras.length; continue }
    } catch {
      failed += system.cameras.length
      continue
    }

    for (const cam of system.cameras) {
      if (!cam.unifiCameraId) continue
      try {
        const snapRes = await request(
          `${base}/proxy/protect/api/cameras/${cam.unifiCameraId}/snapshot`,
          { headers: { Cookie: cookies } }
        )
        if (snapRes.status !== 200) { failed++; continue }
        const storageName = `cam-photo-${crypto.randomUUID()}.jpg`
        await writeFile(path.join(UPLOAD_DIR, storageName), snapRes.buffer)
        await prisma.camera.update({
          where: { id: cam.id },
          data: { photoStorageName: storageName, photoRefreshedAt: new Date() },
        })
        synced++
      } catch {
        failed++
      }
    }
  }

  return NextResponse.json({ ok: true, synced, failed, timestamp: new Date().toISOString() })
}
