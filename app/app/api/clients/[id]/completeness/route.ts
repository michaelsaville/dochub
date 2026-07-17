import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

type Check = { label: string; met: boolean; weight: number }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const [
    contacts, assets, credentials, documents, locations,
    networkDevices, websites, diagrams, runbooks, vlans,
  ] = await Promise.all([
    prisma.person.count({ where: { clientId: id } }),
    prisma.asset.count({ where: { location: { clientId: id } } }),
    prisma.credential.count({ where: { clientId: id, isRetired: false } }),
    prisma.clientDocument.count({ where: { clientId: id } }),
    prisma.location.count({ where: { clientId: id } }),
    prisma.networkDevice.count({ where: { clientId: id, assetId: null } }),
    prisma.website.count({ where: { clientId: id } }),
    prisma.networkDiagram.count({ where: { clientId: id } }),
    prisma.runbook.count({ where: { clientId: id } }),
    prisma.vlan.count({ where: { clientId: id } }),
  ])

  // Primary contact check
  const primaryContact = await prisma.person.findFirst({
    where: { clientId: id, isPrimary: true },
  })

  const checks: Check[] = [
    { label: "Has at least one location", met: locations > 0, weight: 10 },
    { label: "Has a primary contact", met: !!primaryContact, weight: 15 },
    { label: "Has at least one contact", met: contacts > 0, weight: 10 },
    { label: "Has documented assets", met: assets > 0, weight: 15 },
    { label: "Has stored credentials", met: credentials > 0, weight: 10 },
    { label: "Has documentation pages", met: documents > 0, weight: 10 },
    { label: "Has domains/websites tracked", met: websites > 0, weight: 5 },
    { label: "Has network diagram", met: diagrams > 0, weight: 10 },
    { label: "Has runbooks/SOPs", met: runbooks > 0, weight: 5 },
    { label: "Has VLANs documented", met: vlans > 0, weight: 5 },
    { label: "Has network devices documented", met: networkDevices > 0, weight: 5 },
  ]

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const earnedWeight = checks.filter(c => c.met).reduce((s, c) => s + c.weight, 0)
  const score = Math.round((earnedWeight / totalWeight) * 100)

  return NextResponse.json({
    score,
    checks,
    gaps: checks.filter(c => !c.met).map(c => c.label),
  })
}
