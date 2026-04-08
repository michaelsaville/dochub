import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ENTITIES, applyFilters, applySort, applyGroup, formatCell } from "@/lib/report-entities"
import type { ReportConfig, EntityKey } from "@/lib/report-entities"

async function fetchEntityData(entity: EntityKey, clientIds: string[]): Promise<any[]> {
  const clientWhere = clientIds.length > 0 ? clientIds : undefined

  switch (entity) {
    case "assets":
      return prisma.asset.findMany({
        where: clientWhere ? { location: { clientId: { in: clientWhere } } } : undefined,
        include: {
          location: { include: { client: { select: { name: true } } } },
          assetType: { select: { name: true } },
        },
      })

    case "licenses":
      return prisma.license.findMany({
        where: clientWhere ? { clientId: { in: clientWhere } } : undefined,
        include: { client: { select: { name: true } } },
      })

    case "contacts":
      return prisma.contact.findMany({
        where: clientWhere ? { clientId: { in: clientWhere } } : undefined,
        include: { client: { select: { name: true } } },
      })

    case "domains":
      return prisma.website.findMany({
        where: clientWhere ? { clientId: { in: clientWhere } } : undefined,
        include: { client: { select: { name: true } } },
      })

    case "network_devices":
      return prisma.networkDevice.findMany({
        where: clientWhere ? { clientId: { in: clientWhere } } : undefined,
        include: {
          client: { select: { name: true } },
          location: { select: { name: true } },
        },
      })

    case "clients":
      return prisma.client.findMany({
        where: clientWhere ? { id: { in: clientWhere } } : undefined,
        include: {
          _count: { select: { contacts: true, locations: true, licenses: true, websites: true } },
        },
      })

    default:
      return []
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { id } = await params
  const report = await prisma.customReport.findUnique({ where: { id } })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const config = report.config as ReportConfig
  const entity = ENTITIES[report.entity as EntityKey]
  if (!entity) return NextResponse.json({ error: "Unknown entity" }, { status: 400 })

  const raw = await fetchEntityData(report.entity as EntityKey, config.clientIds ?? [])
  const filtered = applyFilters(raw, config.filters ?? [], entity)
  const sorted = applySort(filtered, config.sort ?? null, entity)
  const groups = applyGroup(sorted, config.groupBy ?? null, entity)

  const columns = (config.columns?.length ? config.columns : entity.defaultColumns)
    .map(key => entity.fields.find(f => f.key === key))
    .filter(Boolean) as typeof entity.fields

  const result = groups.map(g => ({
    label: g.label,
    rows: g.rows.map(row => columns.map(col => formatCell(row, col))),
  }))

  return NextResponse.json({
    report: { id: report.id, name: report.name, description: report.description },
    entity: entity.label,
    headers: columns.map(c => c.label),
    groups: result,
    total: filtered.length,
  })
}
