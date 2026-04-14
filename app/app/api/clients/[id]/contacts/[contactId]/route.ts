import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { contactId } = await params
    const body = await req.json()
    const { name, role, email, phone, mobile, notes, isPrimary, isBilling, isEscalation } = body
    const contact = await prisma.person.update({
      where: { id: contactId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(role !== undefined && { role: role?.trim() || null }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(mobile !== undefined && { mobile: mobile?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(isPrimary !== undefined && { isPrimary: !!isPrimary }),
        ...(isBilling !== undefined && { isBilling: !!isBilling }),
        ...(isEscalation !== undefined && { isEscalation: !!isEscalation }),
      },
    })
    return NextResponse.json(contact)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 })
  }
}
