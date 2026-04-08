import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return NextResponse.json({ clients: [], assets: [], credentials: [], runbooks: [], documents: [] })

  const mode = "insensitive" as const
  const contains = (field: string) => ({ contains: q, mode })

  const [clients, assets, credentials, runbooks, documents] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true, name: { contains: q, mode } },
      select: { id: true, name: true, type: true },
      take: 5,
    }),
    prisma.asset.findMany({
      where: {
        status: { not: "RETIRED" },
        OR: [
          { name: contains("name") },
          { friendlyName: contains("friendlyName") },
          { serial: contains("serial") },
          { ipAddress: contains("ipAddress") },
          { make: contains("make") },
          { model: contains("model") },
        ],
      },
      select: {
        id: true,
        name: true,
        friendlyName: true,
        category: true,
        make: true,
        model: true,
        location: { select: { client: { select: { id: true, name: true } } } },
      },
      take: 6,
    }),
    prisma.credential.findMany({
      where: {
        OR: [
          { label: contains("label") },
          { username: contains("username") },
          { url: contains("url") },
        ],
      },
      select: {
        id: true,
        label: true,
        username: true,
        url: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
    prisma.runbook.findMany({
      where: {
        OR: [
          { title: contains("title") },
          { summary: contains("summary") },
        ],
      },
      select: {
        id: true,
        title: true,
        summary: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
    prisma.clientDocument.findMany({
      where: {
        OR: [
          { title: contains("title") },
        ],
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
  ])

  return NextResponse.json({ clients, assets, credentials, runbooks, documents })
}
