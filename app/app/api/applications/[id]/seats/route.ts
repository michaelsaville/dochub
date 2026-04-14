import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const seats = await prisma.appSeatAssignment.findMany({
    where: { applicationId: id },
    include: {
      person: { select: { id: true, name: true, email: true } },
    },
    orderBy: { seatUsername: "asc" },
  })

  // Mask passwords in list view
  return NextResponse.json(seats.map(s => ({
    ...s,
    seatPassword: s.seatPassword ? "••••••••" : null,
    hasPassword: !!s.seatPassword,
  })))
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const app = await prisma.application.findUnique({ where: { id }, select: { clientId: true, name: true, accessType: true, rdpHost: true, rdpPort: true, rdpGateway: true, appUrl: true } })
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 })

  const encryptedPw = body.seatPassword?.trim() ? encrypt(body.seatPassword.trim()) : null

  const seat = await prisma.appSeatAssignment.create({
    data: {
      applicationId: id,
      personId: body.personId || null,
      seatUsername: body.seatUsername?.trim() || null,
      seatPassword: encryptedPw,
      notes: body.notes?.trim() || null,
    },
    include: {
      person: { select: { id: true, name: true, email: true } },
    },
  })

  // Auto-push credential to portal vault if user has a portal account
  if (body.seatPassword?.trim() && body.personId) {
    const email = seat.person?.email
    if (email) {
      const portalUser = await prisma.portalUser.findUnique({ where: { email } })
      if (portalUser) {
        const label = `${app.name}${seat.seatUsername ? ` (${seat.seatUsername})` : ""}`
        const url = app.accessType === "url" ? app.appUrl : app.accessType === "rdp" ? `rdp://${app.rdpHost}:${app.rdpPort || 3389}` : null

        const portalCred = await prisma.portalCredential.create({
          data: {
            clientId: app.clientId,
            ownedByUserId: portalUser.id,
            createdByStaffId: session?.user?.id ?? null,
            label,
            username: body.seatUsername?.trim() || null,
            encryptedPassword: encryptedPw!,
            url,
            notes: `Auto-created from LOB app seat assignment`,
            visibility: "PRIVATE",
          },
        })

        await prisma.appSeatAssignment.update({
          where: { id: seat.id },
          data: { portalCredentialId: portalCred.id },
        })
      }
    }
  }

  return NextResponse.json({
    ...seat,
    seatPassword: seat.seatPassword ? "••••••••" : null,
    hasPassword: !!seat.seatPassword,
  }, { status: 201 })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { seatId } = await req.json()

  const seat = await prisma.appSeatAssignment.findUnique({ where: { id: seatId } })
  if (!seat) return NextResponse.json({ error: "Seat not found" }, { status: 404 })

  // Clean up portal credential if one was auto-created
  if (seat.portalCredentialId) {
    await prisma.portalCredential.delete({ where: { id: seat.portalCredentialId } }).catch(() => {})
  }

  await prisma.appSeatAssignment.delete({ where: { id: seatId } })
  return NextResponse.json({ success: true })
}
