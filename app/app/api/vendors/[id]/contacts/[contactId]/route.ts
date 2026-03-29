import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params
    const body = await req.json()
    const { name, role, email, phone, mobile, notes } = body
    const contact = await prisma.vendorContact.update({
      where: { id: contactId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(role !== undefined && { role: role?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(mobile !== undefined && { mobile: mobile?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
    })
    return NextResponse.json(contact)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params
    await prisma.vendorContact.delete({ where: { id: contactId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 })
  }
}
