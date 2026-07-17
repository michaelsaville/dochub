import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const runbooks = await prisma.runbook.findMany({
      where: { clientId: id },
      include: {
        category: true,
        tags: { include: { tag: true } },
        steps: { orderBy: { order: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json(runbooks)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
