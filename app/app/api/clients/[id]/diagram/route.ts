import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const diagram = await prisma.networkDiagram.findUnique({ where: { clientId: id } })
  return NextResponse.json({ xml: diagram?.xml ?? null })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { xml } = await req.json()

  if (!xml || typeof xml !== "string") {
    return NextResponse.json({ error: "xml required" }, { status: 400 })
  }

  const diagram = await prisma.networkDiagram.upsert({
    where: { clientId: id },
    create: { clientId: id, xml, updatedBy: session.user?.name ?? null },
    update: { xml, updatedBy: session.user?.name ?? null },
  })

  return NextResponse.json({ id: diagram.id, updatedAt: diagram.updatedAt })
}
