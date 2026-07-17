import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        locations: { orderBy: { name: "asc" } },
        people: { orderBy: { name: "asc" } },
        onboardingRunbook:  { select: { id: true, title: true } },
        offboardingRunbook: { select: { id: true, title: true } },
        newClientRunbook:   { select: { id: true, title: true } },
      },
    })
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { name, type, notes, onboardingRunbookId, offboardingRunbookId, newClientRunbookId } = body

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(type && { type }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(onboardingRunbookId !== undefined && { onboardingRunbookId: onboardingRunbookId || null }),
        ...(offboardingRunbookId !== undefined && { offboardingRunbookId: offboardingRunbookId || null }),
        ...(newClientRunbookId !== undefined && { newClientRunbookId: newClientRunbookId || null }),
      },
    })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}