import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { hashPassword, DEFAULT_PERMISSIONS } from "@/lib/portal-auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const users = await prisma.portalUser.findMany({
      where: { clientId: id },
      select: {
        id: true, name: true, email: true, isActive: true,
        permissions: true, lastLoginAt: true, createdAt: true,
        isPortalOwner: true,
        passwordHash: false,
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { name, email, password, permissions, isPortalOwner } = await req.json()
    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email required" }, { status: 400 })
    }
    const passwordHash = password ? await hashPassword(password) : null
    const user = await prisma.portalUser.create({
      data: {
        clientId: id,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        permissions: permissions ?? DEFAULT_PERMISSIONS,
        isPortalOwner: !!isPortalOwner,
      },
      select: {
        id: true, name: true, email: true, isActive: true,
        permissions: true, lastLoginAt: true, createdAt: true,
        isPortalOwner: true,
      },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
