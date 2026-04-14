import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.contacts) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const contacts = await prisma.person.findMany({
    where: { clientId: user.clientId },
    select: {
      id: true, name: true, role: true, email: true, phone: true,
      mobile: true, isPrimary: true, isBilling: true,
    },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  })
  return NextResponse.json(contacts)
}
