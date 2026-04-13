import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

async function requirePortalAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get("portal_session")?.value
  if (!token) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const session = await prisma.portalSession.findUnique({
    where: { token },
    include: { portalUser: true },
  })

  if (!session || session.expiresAt < new Date() || !session.portalUser.isActive) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  return { user: session.portalUser, error: null }
}

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error

  // Find LOB apps for this user's client where user has a seat assignment
  const seats = await prisma.appSeatAssignment.findMany({
    where: {
      application: { clientId: user!.clientId, isLob: true, isActive: true },
      OR: [
        { clientUser: { email: user!.email } },
        { contact: { email: user!.email } },
      ],
    },
    include: {
      application: {
        select: {
          id: true, name: true, vendor: true, accessType: true,
          rdpHost: true, rdpPort: true, rdpGateway: true, appUrl: true,
        },
      },
    },
  })

  return NextResponse.json(seats.map(s => ({
    id: s.id,
    appName: s.application.name,
    vendor: s.application.vendor,
    accessType: s.application.accessType,
    seatUsername: s.seatUsername,
    hasPassword: !!s.seatPassword,
    appUrl: s.application.appUrl,
    // Generate RDP connection info (not the file itself — that's a separate endpoint)
    rdpAvailable: s.application.accessType === "rdp" && !!s.application.rdpHost,
    applicationId: s.application.id,
  })))
}
