import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: { contacts: { orderBy: { name: "asc" } } },
    })
    if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(vendor)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch vendor" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, website, supportUrl, supportPhone, supportEmail, accountNumber, notes, isActive } = body
    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(website !== undefined && { website: website?.trim() || null }),
        ...(supportUrl !== undefined && { supportUrl: supportUrl?.trim() || null }),
        ...(supportPhone !== undefined && { supportPhone: supportPhone?.trim() || null }),
        ...(supportEmail !== undefined && { supportEmail: supportEmail?.trim() || null }),
        ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
    })
    return NextResponse.json(vendor)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.vendor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 })
  }
}
