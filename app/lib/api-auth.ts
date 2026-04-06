import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex")
}

export function generateApiKey(): string {
  return "dhk_" + crypto.randomBytes(32).toString("hex")
}

export async function requireApiKey(req: Request) {
  const auth = req.headers.get("authorization") ?? ""
  if (!auth.startsWith("Bearer ")) {
    return {
      staffUser: null,
      apiKey: null,
      error: NextResponse.json({ error: "Missing Bearer token" }, { status: 401 }),
    }
  }

  const rawKey = auth.slice(7).trim()
  const keyHash = hashApiKey(rawKey)

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { staffUser: true },
  })

  if (!apiKey) {
    return {
      staffUser: null,
      apiKey: null,
      error: NextResponse.json({ error: "Invalid API key" }, { status: 401 }),
    }
  }

  // update lastUsedAt without blocking response
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  return { staffUser: apiKey.staffUser, apiKey, error: null }
}
