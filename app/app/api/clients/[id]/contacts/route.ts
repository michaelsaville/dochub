import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { maybeTriggerOnboardingRunbook } from "@/lib/runbook-triggers"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, role, email, phone, mobile, notes, isPrimary, isBilling, isEscalation } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    const person = await prisma.person.create({
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
    // Lifecycle hook — Person.isActive defaults to true, so a fresh
    // create counts as "activated" for onboarding-runbook purposes.
    void maybeTriggerOnboardingRunbook(person.id, session?.user?.name ?? null)
    return NextResponse.json(person, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
