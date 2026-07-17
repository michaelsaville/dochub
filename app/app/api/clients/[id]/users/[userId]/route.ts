import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { maybeTriggerOnboardingRunbook, maybeTriggerOffboardingRunbook } from "@/lib/runbook-triggers"

// Edit a person. (The People-tab edit form PATCHes here — previously a silent
// 404 because only a summary/ subroute existed.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: clientId, userId } = await params
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const existing = await prisma.person.findFirst({
    where: { id: userId, clientId },
    select: { id: true, isActive: true },
  })
  if (!existing) return NextResponse.json({ error: "Person not found" }, { status: 404 })

  const b = await req.json()
  const str = (v: unknown) => (typeof v === "string" ? (v.trim() || null) : undefined)

  const data: Record<string, unknown> = {}
  if (b.name !== undefined) {
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    data.name = b.name.trim()
  }
  for (const k of ["email", "phone", "mobile", "jobTitle", "m365Upn", "role", "notes"]) {
    if (b[k] !== undefined) data[k] = str(b[k])
  }
  for (const k of ["isPrimary", "isBilling", "isEscalation", "isActive"]) {
    if (b[k] !== undefined) data[k] = !!b[k]
  }

  const person = await prisma.person.update({ where: { id: userId }, data })

  // Lifecycle: fire the client's on/offboarding runbook when active flips.
  if (b.isActive !== undefined && !!b.isActive !== existing.isActive) {
    const actor = session?.user?.name ?? null
    if (existing.isActive && !b.isActive) await maybeTriggerOffboardingRunbook(userId, actor)
    else if (!existing.isActive && b.isActive) await maybeTriggerOnboardingRunbook(userId, actor)
  }

  return NextResponse.json(person)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: clientId, userId } = await params
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const existing = await prisma.person.findFirst({ where: { id: userId, clientId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Person not found" }, { status: 404 })

  try {
    await prisma.person.delete({ where: { id: userId } })
    return NextResponse.json({ success: true })
  } catch {
    // Optional FK relations SET NULL; a hard block means linked records exist.
    return NextResponse.json({ error: "Could not delete — unlink related records first, or deactivate instead" }, { status: 409 })
  }
}
