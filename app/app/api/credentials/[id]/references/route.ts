import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Reverse-link lookup for a credential: every record that references it.
 * Used by the credential row "What uses this?" expander so techs can see
 * exactly which systems will break if the password changes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const cred = await prisma.credential.findUnique({
    where: { id },
    include: {
      asset: { select: { id: true, name: true, friendlyName: true } },
      person: { select: { id: true, name: true } },
      vpnGateways: { select: { id: true, name: true, clientId: true } },
      vpnAccessors: { select: { id: true, vendor: { select: { id: true, name: true } } } },
      phoneSystems: { select: { id: true, name: true, clientId: true } },
    },
  })
  if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    asset: cred.asset,
    person: cred.person,
    vpnGateways: cred.vpnGateways,
    vpnAccessors: cred.vpnAccessors,
    phoneSystems: cred.phoneSystems,
    total:
      (cred.asset ? 1 : 0) +
      (cred.person ? 1 : 0) +
      cred.vpnGateways.length +
      cred.vpnAccessors.length +
      cred.phoneSystems.length,
  })
}
