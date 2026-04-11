import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { name, email, isActive, permissions, isPortalOwner } = await req.json()
    const user = await prisma.portalUser.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email?.trim() ? { email: email.toLowerCase().trim() } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(permissions !== undefined ? { permissions } : {}),
        ...(isPortalOwner !== undefined ? { isPortalOwner: !!isPortalOwner } : {}),
      },
      select: {
        id: true, name: true, email: true, isActive: true,
        permissions: true, lastLoginAt: true, createdAt: true,
        isPortalOwner: true,
      },
    })
    // If deactivating, kill all sessions
    if (isActive === false) {
      await prisma.portalSession.deleteMany({ where: { portalUserId: id } })
    }
    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.portalSession.deleteMany({ where: { portalUserId: id } })
    await prisma.portalUser.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
