import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, role, email, phone, mobile, notes, isPrimary, isBilling, isEscalation } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    const contact = await prisma.contact.create({
      data: {
        clientId: id,
        name: name.trim(),
        role: role?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        mobile: mobile?.trim() || null,
        notes: notes?.trim() || null,
        isPrimary: !!isPrimary,
        isBilling: !!isBilling,
        isEscalation: !!isEscalation,
      },
    })
    return NextResponse.json(contact, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
