import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { parseCidr } from "@/lib/cidr"

const CIRCUIT_INCLUDE = {
  location: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true, supportPhone: true, supportEmail: true } },
  modemAsset: { select: { id: true, name: true, friendlyName: true, category: true } },
  edgeAsset: { select: { id: true, name: true, friendlyName: true, category: true } },
  subnet: { select: { id: true, cidr: true } },
  credential: { select: { id: true, label: true } },
} as const

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const circuits = await prisma.internetCircuit.findMany({
      where: { clientId: id },
      include: CIRCUIT_INCLUDE,
      orderBy: [{ status: "asc" }, { role: "asc" }, { label: "asc" }],
    })
    return NextResponse.json(circuits)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch circuits" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { label, locationId, role, status, serviceType, staticBlockCidr } = body
    if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 })
    if (!locationId) return NextResponse.json({ error: "Location is required" }, { status: 400 })

    // PRIMARY guard: only one ACTIVE PRIMARY per Location.
    if ((role ?? "PRIMARY") === "PRIMARY" && (status ?? "ACTIVE") === "ACTIVE") {
      const conflict = await prisma.internetCircuit.findFirst({
        where: { locationId, role: "PRIMARY", status: "ACTIVE" },
        select: { id: true, label: true },
      })
      if (conflict) {
        return NextResponse.json(
          { error: `Location already has an active primary circuit ("${conflict.label}"). Demote it first or change this circuit's role.` },
          { status: 409 }
        )
      }
    }

    // Auto-derive fields from CIDR if provided and bare fields are blank.
    const derived = staticBlockCidr ? parseCidr(staticBlockCidr) : null
    const data = {
      clientId: id,
      label: label.trim(),
      locationId,
      role: role ?? "PRIMARY",
      status: status ?? "ACTIVE",
      serviceType: serviceType ?? "OTHER",
      circuitId: body.circuitId?.trim() || null,
      accountNumber: body.accountNumber?.trim() || null,
      vendorId: body.vendorId || null,
      ispNameFallback: body.ispNameFallback?.trim() || null,
      supportPhone: body.supportPhone?.trim() || null,
      supportEmail: body.supportEmail?.trim() || null,
      portalUrl: body.portalUrl?.trim() || null,
      credentialId: body.credentialId || null,
      downloadMbps: body.downloadMbps != null ? Number(body.downloadMbps) : null,
      uploadMbps: body.uploadMbps != null ? Number(body.uploadMbps) : null,
      isSymmetric: !!body.isSymmetric,
      wanIp: body.wanIp?.trim() || null,
      staticBlockCidr: derived?.cidr || (staticBlockCidr?.trim() || null),
      subnetMask: body.subnetMask?.trim() || derived?.subnetMask || null,
      gatewayIp: body.gatewayIp?.trim() || derived?.gatewayCandidate || null,
      usableStartIp: body.usableStartIp?.trim() || derived?.usableStartIp || null,
      usableEndIp: body.usableEndIp?.trim() || derived?.usableEndIp || null,
      dns1: body.dns1?.trim() || null,
      dns2: body.dns2?.trim() || null,
      ipv6PrefixCidr: body.ipv6PrefixCidr?.trim() || null,
      ipv6Gateway: body.ipv6Gateway?.trim() || null,
      subnetId: body.subnetId || null,
      modemAssetId: body.modemAssetId || null,
      edgeAssetId: body.edgeAssetId || null,
      installDate: body.installDate ? new Date(body.installDate) : null,
      contractStart: body.contractStart ? new Date(body.contractStart) : null,
      contractEnd: body.contractEnd ? new Date(body.contractEnd) : null,
      cancelDate: body.cancelDate ? new Date(body.cancelDate) : null,
      monthlyCost: body.monthlyCost != null ? Number(body.monthlyCost) : null,
      notes: body.notes?.trim() || null,
    }
    const circuit = await prisma.internetCircuit.create({ data, include: CIRCUIT_INCLUDE })
    return NextResponse.json(circuit, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A circuit with that label already exists at this location." }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create circuit" }, { status: 500 })
  }
}
