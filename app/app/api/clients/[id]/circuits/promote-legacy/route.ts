import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { parseLegacyWanIp } from "@/lib/cidr"

// One-shot upgrader: for every Location on this Client with legacy ispName/wanIp
// AND no existing legacyImported circuit, create one circuit. Idempotent — safe
// to re-run. Empty-state CTA on CircuitsPanel calls this.

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const locations = await prisma.location.findMany({
      where: {
        clientId: id,
        OR: [{ ispName: { not: null } }, { wanIp: { not: null } }],
      },
      select: { id: true, name: true, ispName: true, wanIp: true },
    })
    const ispVendors = await prisma.vendor.findMany({
      where: { category: "ISP" },
      select: { id: true, name: true },
    })
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "")
    const vendorMap = new Map(ispVendors.map(v => [normalize(v.name), v.id]))

    const created: { locationName: string; circuitId: string; wanIpKind: string; vendor: string; vendorCreated: boolean }[] = []

    for (const loc of locations) {
      const existing = await prisma.internetCircuit.findFirst({
        where: { locationId: loc.id, legacyImported: true },
        select: { id: true },
      })
      if (existing) continue

      let vendorId: string | null = null
      let ispNameFallback: string | null = loc.ispName?.trim() || null
      let vendorWasCreated = false
      if (loc.ispName) {
        const key = normalize(loc.ispName)
        const matched = vendorMap.get(key)
        if (matched) {
          vendorId = matched
          ispNameFallback = null
        } else {
          const v = await prisma.vendor.create({
            data: { name: loc.ispName.trim(), category: "ISP", notes: "Auto-created during InternetCircuit backfill" },
            select: { id: true, name: true },
          })
          vendorId = v.id
          ispNameFallback = null
          vendorMap.set(normalize(v.name), v.id)
          vendorWasCreated = true
        }
      }

      const parsed = parseLegacyWanIp(loc.wanIp)
      const baseLabel = loc.ispName?.trim() || "Legacy circuit"
      // Avoid colliding with an existing label at this location.
      let label = baseLabel
      let suffix = 1
      while (await prisma.internetCircuit.findFirst({ where: { locationId: loc.id, label }, select: { id: true } })) {
        suffix++
        label = `${baseLabel} (${suffix})`
      }

      const circuit = await prisma.internetCircuit.create({
        data: {
          clientId: id,
          locationId: loc.id,
          label,
          role: "PRIMARY",
          status: "ACTIVE",
          serviceType: "OTHER",
          vendorId,
          ispNameFallback,
          wanIp: parsed.kind === "ip" ? parsed.value : null,
          staticBlockCidr: parsed.kind === "cidr" ? parsed.value : null,
          subnetMask: parsed.info?.subnetMask ?? null,
          gatewayIp: parsed.info?.gatewayCandidate ?? null,
          usableStartIp: parsed.info?.usableStartIp ?? null,
          usableEndIp: parsed.info?.usableEndIp ?? null,
          notes: parsed.kind === "none" && loc.wanIp ? `Legacy wanIp: ${loc.wanIp}` : null,
          legacyImported: true,
        },
        select: { id: true },
      })

      created.push({
        locationName: loc.name,
        circuitId: circuit.id,
        wanIpKind: parsed.kind,
        vendor: loc.ispName ?? "",
        vendorCreated: vendorWasCreated,
      })
    }

    return NextResponse.json({ promoted: created.length, items: created })
  } catch (e) {
    return NextResponse.json({ error: "Promote-legacy failed" }, { status: 500 })
  }
}
