import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { generateApiKey, hashApiKey } from "@/lib/api-auth"

// List keys for current user (never returns the key itself — only metadata)
export async function GET(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const staffUser = await prisma.staffUser.findUnique({ where: { email: session!.user!.email! } })
  if (!staffUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const keys = await prisma.apiKey.findMany({
    where: { staffUserId: staffUser.id },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true, expiresAt: true, scope: true },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ keys })
}

// Generate a new key — returns the raw key ONCE, then it's gone
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const staffUser = await prisma.staffUser.findUnique({ where: { email: session!.user!.email! } })
  if (!staffUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const body = await req.json()
  const name: string = body.name?.trim()
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  // Default 90-day expiry (0/null = never); optional read-only scope (no reveal).
  const days = body.expiresInDays === null ? null : Number.isFinite(body.expiresInDays) ? body.expiresInDays : 90
  const expiresAt = days && days > 0 ? new Date(Date.now() + days * 86400000) : null
  const scope = body.readOnly === true ? "read" : null

  const rawKey = generateApiKey()
  const keyHash = hashApiKey(rawKey)

  const apiKey = await prisma.apiKey.create({
    data: { name, keyHash, staffUserId: staffUser.id, expiresAt, scope },
    select: { id: true, name: true, createdAt: true, expiresAt: true, scope: true },
  })

  return NextResponse.json({ ...apiKey, key: rawKey }, { status: 201 })
}
