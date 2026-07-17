import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Admin: view/manage which clients each non-admin staff member is scoped to.
// (Admins always see all clients, so they aren't listed here.)
export async function GET() {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const [staff, clients] = await Promise.all([
    prisma.staffUser.findMany({
      where: { isActive: true, role: { not: "ADMIN" } },
      select: {
        id: true, name: true, email: true, role: true,
        clientAssignments: { select: { clientId: true } },
      },
      orderBy: { email: "asc" },
    }),
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ])
  return NextResponse.json({
    staff: staff.map((s) => ({
      id: s.id, name: s.name, email: s.email, role: s.role,
      clientIds: s.clientAssignments.map((a) => a.clientId),
    })),
    clients,
  })
}

// Replace a staff member's full set of client assignments.
// clientIds == [] restores "unassigned = see all" for that tech.
export async function PUT(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { staffUserId, clientIds } = await req.json()
  if (!staffUserId || !Array.isArray(clientIds)) {
    return NextResponse.json({ error: "staffUserId and clientIds[] required" }, { status: 400 })
  }
  await prisma.$transaction([
    prisma.staffClientAssignment.deleteMany({ where: { staffUserId } }),
    ...(clientIds.length
      ? [prisma.staffClientAssignment.createMany({
          data: clientIds.map((clientId: string) => ({ staffUserId, clientId })),
          skipDuplicates: true,
        })]
      : []),
  ])
  return NextResponse.json({ ok: true })
}
