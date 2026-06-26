import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** DELETE — un-share an item from a vendor grant. ADMIN only. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; grantId: string; shareId: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id, grantId, shareId } = await params

  // Scope the delete to this client + grant so an id alone can't reach across.
  const share = await prisma.vendorShare.findFirst({
    where: { id: shareId, grantId, grant: { clientId: id } },
    select: { id: true },
  })
  if (!share) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.vendorShare.delete({ where: { id: shareId } })
  return NextResponse.json({ ok: true })
}
