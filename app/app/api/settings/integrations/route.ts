import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Keys stored in AppSetting for all integrations + push channels + security.
// Password/token fields are stored as-is (internal tool).
const SENSITIVE_KEYS = new Set([
  "integration:unifi:password",
  "integration:unifi:apiKey",
  "integration:hpinstanton:bearerToken",
  "integration:sonicwall:devices", // JSON array — not individually sensitive but contains passwords
  "integration:resend:apiKey",
  "push:pushover:appToken",
  "push:pushover:userKey",
])

// Settings prefixes this endpoint accepts. Anything outside these is ignored
// to keep the surface area narrow and prevent arbitrary AppSetting writes.
const ALLOWED_PREFIXES = ["integration:", "push:", "security:", "alerts:"]
const isAllowedKey = (k: string) => ALLOWED_PREFIXES.some(p => k.startsWith(p))

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { OR: ALLOWED_PREFIXES.map(p => ({ key: { startsWith: p } })) },
    })
    const result: Record<string, string> = {}
    for (const r of rows) {
      result[r.key] = SENSITIVE_KEYS.has(r.key) ? "••••••" : r.value
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

async function writeSettings(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body: Record<string, string> = await req.json()
    const updates: Promise<any>[] = []
    for (const [key, value] of Object.entries(body)) {
      if (!isAllowedKey(key)) continue
      if (value === "••••••") continue // skip redacted placeholder
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

// Accept both PATCH (legacy) and POST (newer panels) so we don't have to
// touch every existing settings card to flip method names.
export const PATCH = writeSettings
export const POST = writeSettings
