import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET — the client's credentials, documents and files, as lightweight picker
 * options for the "share with vendor" UI. No secret material is returned.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const [credentials, documents, files] = await Promise.all([
    prisma.credential.findMany({
      where: { clientId: id, isRetired: false },
      select: { id: true, label: true, username: true, url: true },
      orderBy: { label: "asc" },
    }),
    prisma.clientDocument.findMany({
      where: { clientId: id },
      select: { id: true, title: true, category: true },
      orderBy: { title: "asc" },
    }),
    prisma.clientAttachment.findMany({
      where: { clientId: id, supersededBy: null },
      select: { id: true, originalName: true, mimeType: true, detectedMime: true, size: true },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return NextResponse.json({ credentials, documents, files })
}
