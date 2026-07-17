import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

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
    const { name, address, city, state, zip, ispName, wanIp, notes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Verify client exists
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } })
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    const location = await prisma.location.create({
      data: {
        clientId: id,
        name: name.trim(),
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        ispName: ispName?.trim() || null,
        wanIp: wanIp?.trim() || null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(location, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create location" }, { status: 500 })
  }
}
