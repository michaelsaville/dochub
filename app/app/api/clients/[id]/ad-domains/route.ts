import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const domains = await prisma.adDomain.findMany({
      where: { clientId: id },
      include: {
        credential: { select: { id: true, label: true, username: true } },
        groups: { orderBy: { name: "asc" } },
        shares: {
          include: {
            asset: { select: { id: true, name: true, friendlyName: true } },
            permissions: {
              include: { domainGroup: { select: { id: true, name: true } } },
              orderBy: { principal: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(domains)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
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
    const { name, netbiosName, functionalLevel, notes, credUsername, credPassword, credLabel } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

    // Optionally create a credential and link it
    let credentialId: string | null = null
    if (credPassword?.trim()) {
      const label = credLabel?.trim() || `${name.trim()} – Domain Admin`
      const cred = await prisma.credential.create({
        data: {
          clientId: id,
          label,
          username: credUsername?.trim() || null,
          encryptedPassword: encrypt(credPassword.trim()),
          url: null,
        },
      })
      credentialId = cred.id
    }

    const domain = await prisma.adDomain.create({
      data: {
        clientId: id,
        name: name.trim(),
        netbiosName: netbiosName?.trim() || null,
        functionalLevel: functionalLevel?.trim() || null,
        credentialId,
        notes: notes?.trim() || null,
      },
      include: {
        credential: { select: { id: true, label: true, username: true } },
        groups: true,
        shares: { include: { permissions: true } },
      },
    })
    return NextResponse.json(domain, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 })
  }
}
