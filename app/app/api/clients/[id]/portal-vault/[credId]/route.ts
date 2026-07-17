import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

// DELETE — MSP techs may delete an MSP_SHARED credential from a client's vault
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; credId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: clientId, credId } = await params
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const item = await prisma.portalCredential.findFirst({
    where: { id: credId, clientId, visibility: "MSP_SHARED" },
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.portalCredential.delete({ where: { id: credId } })
  return NextResponse.json({ success: true })
}
