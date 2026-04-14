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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ seatId: string }> }
) {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const { seatId } = await params

  const seat = await prisma.appSeatAssignment.findUnique({
    where: { id: seatId },
    include: {
      application: true,
      person: { select: { email: true } },
    },
  })

  if (!seat) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Verify this seat belongs to the requesting portal user
  const seatEmail = seat.person?.email
  if (seatEmail !== user!.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const app = seat.application
  if (app.accessType !== "rdp" || !app.rdpHost) {
    return NextResponse.json({ error: "Not an RDP application" }, { status: 400 })
  }

  // Generate .rdp file content
  const lines: string[] = [
    `full address:s:${app.rdpHost}:${app.rdpPort || 3389}`,
    `username:s:${seat.seatUsername || ""}`,
    "prompt for credentials:i:1",
    "screen mode id:i:2",
    "use multimon:i:0",
    "desktopwidth:i:1920",
    "desktopheight:i:1080",
    "session bpp:i:32",
    "compression:i:1",
    "keyboardhook:i:2",
    "audiocapturemode:i:0",
    "videoplaybackmode:i:1",
    "connection type:i:7",
    "networkautodetect:i:1",
    "bandwidthautodetect:i:1",
    "displayconnectionbar:i:1",
    "enableworkspacereconnect:i:0",
    "disable wallpaper:i:0",
    "allow font smoothing:i:1",
    "allow desktop composition:i:1",
    "disable full window drag:i:0",
    "disable menu anims:i:0",
    "disable themes:i:0",
    "disable cursor setting:i:0",
    "bitmapcachepersistenable:i:1",
    "audiomode:i:0",
    "redirectprinters:i:0",
    "redirectcomports:i:0",
    "redirectsmartcards:i:0",
    "redirectclipboard:i:1",
    "redirectposdevices:i:0",
    "autoreconnection enabled:i:1",
    "authentication level:i:2",
    "negotiate security layer:i:1",
    "remoteapplicationmode:i:0",
    "alternate shell:s:",
    "shell working directory:s:",
  ]

  if (app.rdpGateway) {
    lines.push(`gatewayhostname:s:${app.rdpGateway}`)
    lines.push("gatewayusagemethod:i:1")
    lines.push("gatewaycredentialssource:i:0")
    lines.push("gatewayprofileusagemethod:i:1")
  } else {
    lines.push("gatewayusagemethod:i:0")
  }

  const rdpContent = lines.join("\r\n") + "\r\n"
  const safeName = app.name.replace(/[^a-zA-Z0-9_-]/g, "_")
  const filename = `${safeName}_${seat.seatUsername || "connection"}.rdp`

  return new NextResponse(rdpContent, {
    headers: {
      "Content-Type": "application/x-rdp",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
