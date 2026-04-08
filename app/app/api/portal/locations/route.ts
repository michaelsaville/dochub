import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.locations) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const locations = await prisma.location.findMany({
    where: { clientId: user.clientId, isActive: true },
    select: {
      id: true, name: true, address: true, city: true, state: true,
      zip: true, ispName: true, wanIp: true, notes: true,
    },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(locations)
}
