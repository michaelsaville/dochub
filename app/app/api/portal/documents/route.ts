import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.documents) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const docs = await prisma.clientDocument.findMany({
    where: { clientId: user.clientId },
    select: {
      id: true, title: true, content: true, category: true, isPinned: true,
      updatedAt: true,
      folder: { select: { id: true, name: true } },
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  })
  return NextResponse.json(docs)
}
