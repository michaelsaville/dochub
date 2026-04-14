import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params
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
    data.credentials = creds.map(c => ({
      ...c,
      password: c.encryptedPassword ? decrypt(c.encryptedPassword) : null,
      encryptedPassword: undefined,
    }))
  }

  if (modules.includes("licenses")) {
    data.licenses = await prisma.license.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" },
      include: {
        vendorRef: { select: { name: true } },
        person: { select: { name: true } },
      },
    })
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
