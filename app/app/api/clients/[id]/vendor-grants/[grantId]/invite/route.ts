import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { callPortal, PortalCallError } from "@/lib/vendor-portal-client"

export const dynamic = "force-dynamic"

/**
 * POST — invite a vendor contact to the vendor portal for this grant. DocHub
 * does not own vendor-portal accounts (the super-portal does), so this calls
 * the portal's provision endpoint, which upserts the VENDOR PortalUser, links
 * it to (this vendor, this client) and issues a setup/invite magic link. The
 * returned setupUrl is shown to staff to copy or have emailed. ADMIN only.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id, grantId } = await params
  const { email, name } = await req.json()
  if (!email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 })

  const grant = await prisma.vendorClientGrant.findFirst({
    where: { id: grantId, clientId: id },
    include: {
      vendor: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  })
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 })
  if (!grant.isActive) return NextResponse.json({ error: "Grant is inactive" }, { status: 400 })

  try {
    const result = await callPortal<{ ok: boolean; setupUrl?: string; emailed?: boolean }>(
      "/api/bff/vendor/provision",
      {
        email: email.toLowerCase().trim(),
        name: name?.trim() || null,
        vendorId: grant.vendor.id,
        vendorName: grant.vendor.name,
        clientId: grant.client.id,
        clientName: grant.client.name,
      },
    )
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof PortalCallError) {
      return NextResponse.json(
        { error: "Portal rejected the invite", detail: e.payload },
        { status: 502 },
      )
    }
    return NextResponse.json(
      { error: "Could not reach the portal to provision the vendor account" },
      { status: 502 },
    )
  }
}
