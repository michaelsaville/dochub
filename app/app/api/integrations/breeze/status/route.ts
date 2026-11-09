import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { breezeConfigured, fetchOrgs, normalizeOrgName, BREEZE_URL, BreezeError } from "@/lib/breeze"

/** GET — Settings → Breeze: connection state, last sync, org ↔ client mapping table. */
export async function GET() {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const [last, syncroAssets, clients] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "integration:breeze:lastSync" } }),
    prisma.appSetting.findUnique({ where: { key: "integration:syncro:assetsDisabled" } }),
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true, breezeOrgId: true }, orderBy: { name: "asc" } }),
  ])
  const base = {
    configured: breezeConfigured(),
    breezeUrl: BREEZE_URL,
    lastSync: last ? JSON.parse(last.value) : null,
    syncroAssetsDisabled: syncroAssets?.value === "true",
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
  }
  if (!base.configured) return NextResponse.json({ ...base, orgs: [] })
  try {
    const orgs = await fetchOrgs()
    const byOrg = new Map(clients.filter((c) => c.breezeOrgId).map((c) => [c.breezeOrgId!, c]))
    return NextResponse.json({
      ...base,
      orgs: orgs
        .filter((o) => o.type !== "internal")
        .map((o) => {
          const mapped = byOrg.get(o.id)
          const suggestion = mapped ? null : clients.find((c) => !c.breezeOrgId && normalizeOrgName(c.name) === normalizeOrgName(o.name))
          return { id: o.id, name: o.name, clientId: mapped?.id ?? null, clientName: mapped?.name ?? null, suggestedClientId: suggestion?.id ?? null }
        })
        .sort((a, b) => Number(!!a.clientId) - Number(!!b.clientId) || a.name.localeCompare(b.name)),
    })
  } catch (e) {
    return NextResponse.json({ ...base, orgs: [], error: e instanceof BreezeError ? e.message : "Couldn't reach Breeze" })
  }
}

/** PATCH { syncroAssetsDisabled: boolean } — hand asset ownership from Syncro to Breeze. */
export async function PATCH(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const body = await req.json().catch(() => ({}))
  if (typeof body.syncroAssetsDisabled !== "boolean") return NextResponse.json({ error: "syncroAssetsDisabled boolean required" }, { status: 400 })
  const value = String(body.syncroAssetsDisabled)
  await prisma.appSetting.upsert({
    where: { key: "integration:syncro:assetsDisabled" },
    update: { value },
    create: { key: "integration:syncro:assetsDisabled", value },
  })
  return NextResponse.json({ ok: true, syncroAssetsDisabled: body.syncroAssetsDisabled })
}
