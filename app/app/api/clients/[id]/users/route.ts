import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const users = await prisma.clientUser.findMany({
    where: { clientId: id },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  })
  return NextResponse.json(users)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: clientId } = await params

  const body = await req.json()
  const { name, email, phone, jobTitle, m365Upn } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // Verify client exists
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  })
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const user = await prisma.clientUser.create({
    data: {
      clientId,
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      jobTitle: jobTitle?.trim() || null,
      m365Upn: m365Upn?.trim() || null,
    },
  })

  // Cross-sync: create matching TH_Contact in TicketHub
  try {
    // Find the matching TH_Client by name
    const thClients: { id: string }[] = await prisma.$queryRaw`
      SELECT id FROM tickethub.th_clients
      WHERE name ILIKE ${client.name}
      LIMIT 1
    `

    if (thClients.length > 0) {
      const thClientId = thClients[0].id
      const nameParts = name.trim().split(/\s+/)
      const firstName = nameParts[0] || name.trim()
      const lastName = nameParts.slice(1).join(" ") || ""
      const cuid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

      // Check if contact already exists (by email match)
      const existing: { id: string }[] = email?.trim()
        ? await prisma.$queryRaw`
            SELECT id FROM tickethub.th_contacts
            WHERE "clientId" = ${thClientId} AND email ILIKE ${email.trim()}
            LIMIT 1
          `
        : []

      if (existing.length === 0) {
        await prisma.$executeRaw`
          INSERT INTO tickethub.th_contacts (id, "clientId", "firstName", "lastName", email, phone, "jobTitle", "isActive", "createdAt", "updatedAt")
          VALUES (${cuid}, ${thClientId}, ${firstName}, ${lastName}, ${email?.trim() ?? null}, ${phone?.trim() ?? null}, ${jobTitle?.trim() ?? null}, true, NOW(), NOW())
        `
      }
    }
  } catch (e) {
    // Cross-sync failure shouldn't block the primary create
    console.error("[api/clients/users] TicketHub cross-sync failed", e)
  }

  return NextResponse.json(user, { status: 201 })
}
