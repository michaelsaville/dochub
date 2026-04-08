import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.domains) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const domains = await prisma.website.findMany({
    where: { clientId: user.clientId },
    select: {
      id: true, domain: true, registrar: true, autoRenew: true,
      expiresAt: true, sslExpiresAt: true, sslIssuer: true,
    },
    orderBy: { domain: "asc" },
  })
  return NextResponse.json(domains)
}
