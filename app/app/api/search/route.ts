import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const q = req.nextUrl.searchParams.get("q")?.trim()
  const scopeClientId = req.nextUrl.searchParams.get("clientId")?.trim() || null
  if (!q || q.length < 2) return NextResponse.json({ clients: [], assets: [], credentials: [], runbooks: [], documents: [], files: [] })

  const mode = "insensitive" as const
  const contains = (field: string) => ({ contains: q, mode })

  const [clients, assets, credentials, runbooks, documents, files] = await Promise.all([
    // When scoped to a client, never return other Client rows — the tech is
    // already on that client's page.
    scopeClientId ? Promise.resolve([] as any[]) : prisma.client.findMany({
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
        ...(scopeClientId ? { location: { clientId: scopeClientId } } : {}),
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
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
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
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
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
          { content: contains("content") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
    // Files: match the human name, the caption, OR the extracted/OCR'd text.
    prisma.clientAttachment.findMany({
      where: {
        supersededBy: null,
        OR: [
          { originalName: contains("originalName") },
          { notes: contains("notes") },
          { searchableText: contains("searchableText") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        clientId: true,
        documentId: true,
        client: { select: { id: true, name: true } },
      },
      take: 6,
    }),
  ])

  return NextResponse.json({ clients, assets, credentials, runbooks, documents, files })
}
