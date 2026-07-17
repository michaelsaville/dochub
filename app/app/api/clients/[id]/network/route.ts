import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { upsertNetworkAsset, loadAssetTypeMap, NETWORK_TYPE_MAP } from "@/lib/network-asset"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const url = new URL(req.url)
    const includeInactive = url.searchParams.get("includeInactive") === "true"
    const devices = await prisma.networkDevice.findMany({
      where: { clientId: id, ...(includeInactive ? {} : { isActive: true }) },
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })
    return NextResponse.json(devices)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch network devices" }, { status: 500 })
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
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { name, type, make, model, ipAddress, macAddress, serial, firmwareVersion, managementUrl, locationId, notes, portCount } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    // Network gear is documented as an Asset (NetworkDevice is sync/legacy only).
    // Route manual creation through the same Asset upsert the integrations use.
    const typeByName = await loadAssetTypeMap()
    const assetTypeName = NETWORK_TYPE_MAP[(type || "OTHER") as string] ?? "Other"
    let assetId: string
    try {
      assetId = await upsertNetworkAsset(
        id,
        locationId || null,
        { mac: macAddress?.trim() || null, serial: serial?.trim() || null },
        {
          name: name.trim(),
          assetTypeId: typeByName[assetTypeName] ?? null,
          make: make?.trim() || null,
          model: model?.trim() || null,
          ipAddress: ipAddress?.trim() || null,
          macAddress: macAddress?.trim()?.toLowerCase() || null,
          serial: serial?.trim() || null,
          firmwareVersion: firmwareVersion?.trim() || null,
          managementUrl: managementUrl?.trim() || null,
          portCount: portCount ? Number(portCount) : null,
          notes: notes?.trim() || null,
        },
        "MANUAL",
      )
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Client has no location to attach the device to" }, { status: 422 })
    }
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        location: { select: { id: true, name: true } },
        assetType: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(asset, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create network device" }, { status: 500 })
  }
}
