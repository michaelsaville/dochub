import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const isAdmin = session?.user?.role === "ADMIN"
  const url = new URL(req.url)
  const modules = url.searchParams.get("modules")?.split(",") ?? []

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      locations: { orderBy: { name: "asc" } },
      people: { orderBy: { name: "asc" } },
    },
  })
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: Record<string, any> = { client }

  if (modules.includes("assets")) {
    const locations = await prisma.location.findMany({
      where: { clientId: id },
      include: {
        assets: {
          orderBy: { name: "asc" },
          include: {
            assetType: { select: { name: true } },
            person: { select: { name: true } },
          },
        },
      },
    })
    data.assets = locations.flatMap(l => l.assets)
  }

  if (modules.includes("credentials")) {
    const creds = await prisma.credential.findMany({
      where: { clientId: id, isRetired: false },
      orderBy: { label: "asc" },
    })
    // RBAC: same gate as the reveal endpoint — ADMIN sees every password,
    // TECH only those flagged allowTechReveal. Others are redacted, never
    // decrypted, so the report can't be used to bypass allowTechReveal.
    data.credentials = creds.map(c => {
      const mayReveal = isAdmin || c.allowTechReveal
      return {
        ...c,
        password: mayReveal && c.encryptedPassword ? decrypt(c.encryptedPassword) : null,
        passwordRedacted: !mayReveal && !!c.encryptedPassword,
        encryptedPassword: undefined,
        encryptedTotp: undefined,
        encryptedNotes: undefined,
      }
    })
  }

  if (modules.includes("licenses")) {
    const lics = await prisma.license.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" },
      include: {
        vendorRef: { select: { name: true } },
        person: { select: { name: true } },
      },
    })
    // License keys are ADMIN-only (see the reveal route); never ship the
    // encrypted blob in a report payload.
    data.licenses = lics.map(l => ({ ...l, licenseKey: undefined }))
  }

  if (modules.includes("vendors")) {
    data.vendors = await prisma.vendor.findMany({
      where: { clients: { some: { id } } },
      orderBy: { name: "asc" },
      include: {
        contacts: { orderBy: { name: "asc" } },
      },
    })
  }

  if (modules.includes("network")) {
    data.network = await prisma.networkDevice.findMany({
      where: { clientId: id, isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { location: { select: { name: true } } },
    })
    data.subnets = await prisma.subnet.findMany({
      where: { clientId: id },
      orderBy: { cidr: "asc" },
      include: {
        ipAssignments: { orderBy: { ipAddress: "asc" } },
        location: { select: { name: true } },
      },
    })
  }

  if (modules.includes("contacts") || modules.includes("users")) {
    data.people = client.people
  }

  if (modules.includes("locations")) {
    data.locations = client.locations
  }

  if (modules.includes("sops")) {
    data.sops = await prisma.runbook.findMany({
      where: { clientId: id },
      orderBy: { title: "asc" },
      include: {
        category: true,
        steps: { orderBy: { order: "asc" } },
      },
    })
    // Also include global SOPs
    data.globalSops = await prisma.runbook.findMany({
      where: { clientId: null },
      orderBy: { title: "asc" },
      include: {
        category: true,
        steps: { orderBy: { order: "asc" } },
      },
    })
  }

  if (modules.includes("websites")) {
    data.websites = await prisma.website.findMany({
      where: { clientId: id },
      orderBy: { domain: "asc" },
    })
  }

  return NextResponse.json(data)
}
