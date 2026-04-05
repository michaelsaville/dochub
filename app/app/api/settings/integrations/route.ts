import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Keys stored in AppSetting for all integrations.
// Password/token fields are stored as-is (internal tool).
const SENSITIVE_KEYS = new Set([
  "integration:unifi:password",
  "integration:unifi:apiKey",
  "integration:hpinstanton:bearerToken",
  "integration:sonicwall:devices", // JSON array — not individually sensitive but contains passwords
])

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { startsWith: "integration:" } },
    })
    const result: Record<string, string> = {}
    for (const r of rows) {
      // Redact sensitive values in GET response
      result[r.key] = SENSITIVE_KEYS.has(r.key) ? "••••••" : r.value
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body: Record<string, string> = await req.json()
    const updates: Promise<any>[] = []
    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith("integration:")) continue
      if (value === "••••••") continue // skip redacted placeholder, don't overwrite
      updates.push(
        prisma.appSetting.upsert({
          where: { key },
          update: { value, updatedAt: new Date() },
          create: { key, value },
        })
      )
    }
    await Promise.all(updates)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
