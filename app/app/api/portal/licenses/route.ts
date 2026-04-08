import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.licenses) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const licenses = await prisma.license.findMany({
    where: { clientId: user.clientId },
    select: {
      id: true, name: true, vendor: true, seats: true, assignedSeats: true,
      expiryDate: true, renewalDate: true,
      // licenseKey intentionally excluded
    },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(licenses)
}
