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
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const configs = await prisma.backupConfig.findMany({
    where: { clientId: id },
    include: {
      protectedAssets: {
        include: { asset: { select: { id: true, name: true, friendlyName: true } } },
      },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(configs)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const body = await req.json()

  const config = await prisma.backupConfig.create({
    data: {
      clientId: id,
      name: body.name?.trim(),
      technology: body.technology?.trim(),
      type: body.type || "image",
      frequency: body.frequency?.trim() || null,
      window: body.window?.trim() || null,
      retentionPolicy: body.retentionPolicy?.trim() || null,
      target: body.target?.trim() || null,
      encryptionEnabled: body.encryptionEnabled ?? false,
      nextVerifyBy: body.nextVerifyBy ? new Date(body.nextVerifyBy) : null,
      notes: body.notes?.trim() || null,
    },
    include: { protectedAssets: true },
  })

  return NextResponse.json(config, { status: 201 })
}
