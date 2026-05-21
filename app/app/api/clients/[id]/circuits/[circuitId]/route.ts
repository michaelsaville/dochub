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
  _req: Request,
  { params }: { params: Promise<{ id: string; circuitId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { circuitId } = await params
    const circuit = await prisma.internetCircuit.findUnique({ where: { id: circuitId }, include: CIRCUIT_INCLUDE })
    if (!circuit) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(circuit)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch circuit" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; circuitId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { circuitId } = await params
    const body = await req.json()
    const current = await prisma.internetCircuit.findUnique({
      where: { id: circuitId },
      select: { locationId: true, role: true, status: true },
    })
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const nextRole = body.role ?? current.role
    const nextStatus = body.status ?? current.status
    if (nextRole === "PRIMARY" && nextStatus === "ACTIVE") {
      const conflict = await prisma.internetCircuit.findFirst({
        where: { locationId: current.locationId, role: "PRIMARY", status: "ACTIVE", id: { not: circuitId } },
        select: { id: true, label: true },
      })
      if (conflict) {
        return NextResponse.json(
          { error: `Location already has another active primary circuit ("${conflict.label}").` },
          { status: 409 }
        )
      }
    }

    const derived = body.staticBlockCidr ? parseCidr(body.staticBlockCidr) : null
    const data: Record<string, any> = {}
    const trimmedString = (key: string) => { if (body[key] !== undefined) data[key] = body[key]?.trim() || null }
    const passthrough = (key: string) => { if (body[key] !== undefined) data[key] = body[key] }
    ;["label", "circuitId", "accountNumber", "ispNameFallback", "supportPhone", "supportEmail",
      "portalUrl", "wanIp", "subnetMask", "gatewayIp", "usableStartIp", "usableEndIp",
      "dns1", "dns2", "ipv6PrefixCidr", "ipv6Gateway", "notes"].forEach(trimmedString)
    ;["role", "status", "serviceType", "vendorId", "credentialId", "subnetId",
      "modemAssetId", "edgeAssetId", "isSymmetric"].forEach(passthrough)
    if (body.staticBlockCidr !== undefined) data.staticBlockCidr = derived?.cidr || (body.staticBlockCidr?.trim() || null)
    if (body.downloadMbps !== undefined) data.downloadMbps = body.downloadMbps != null ? Number(body.downloadMbps) : null
    if (body.uploadMbps !== undefined) data.uploadMbps = body.uploadMbps != null ? Number(body.uploadMbps) : null
    if (body.monthlyCost !== undefined) data.monthlyCost = body.monthlyCost != null ? Number(body.monthlyCost) : null
    ;["installDate", "contractStart", "contractEnd", "cancelDate"].forEach(k => {
      if (body[k] !== undefined) data[k] = body[k] ? new Date(body[k]) : null
    })
    if (derived) {
      // Only auto-fill derived fields when the caller didn't supply them explicitly.
      if (data.subnetMask == null && body.subnetMask === undefined) data.subnetMask = derived.subnetMask
      if (data.gatewayIp == null && body.gatewayIp === undefined) data.gatewayIp = derived.gatewayCandidate
      if (data.usableStartIp == null && body.usableStartIp === undefined) data.usableStartIp = derived.usableStartIp
      if (data.usableEndIp == null && body.usableEndIp === undefined) data.usableEndIp = derived.usableEndIp
    }

    const circuit = await prisma.internetCircuit.update({ where: { id: circuitId }, data, include: CIRCUIT_INCLUDE })
    return NextResponse.json(circuit)
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A circuit with that label already exists at this location." }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to update circuit" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; circuitId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { circuitId } = await params
    await prisma.internetCircuit.delete({ where: { id: circuitId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete circuit" }, { status: 500 })
  }
}
