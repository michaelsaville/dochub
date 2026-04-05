import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const SETTING_KEY = "source_colors"

const DEFAULTS: Record<string, string> = {
  SYNCRO:   "#3b82f6",
  UNIFI:    "#8b5cf6",
  ITFLOW:   "#f97316",
  PAX8:     "#10b981",
  PULSEWAY: "#ec4899",
}

export async function GET() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
    const stored = row ? JSON.parse(row.value) : {}
    return NextResponse.json({ ...DEFAULTS, ...stored })
  } catch {
    return NextResponse.json(DEFAULTS)
  }
}

export async function PATCH(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    // Only allow valid hex colors
    const sanitized: Record<string, string> = {}
    for (const [k, v] of Object.entries(body)) {
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
        sanitized[k] = v
      }
    }
    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(sanitized) },
      update: { value: JSON.stringify(sanitized) },
    })
    return NextResponse.json({ ...DEFAULTS, ...sanitized })
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
}
