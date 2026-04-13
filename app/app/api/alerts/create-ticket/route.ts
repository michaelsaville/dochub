import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * POST /api/alerts/create-ticket
 *
 * Creates a ticket in TicketHub (tickethub schema) from a DocHub alert.
 * Cross-schema raw SQL insert since TicketHub uses a separate Prisma schema.
 *
 * Body: { clientName, title, description, priority?, type? }
 */
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const body = await req.json()
  const { clientName, title, description, priority, type } = body

  if (!clientName?.trim() || !title?.trim()) {
    return NextResponse.json({ error: "clientName and title required" }, { status: 400 })
  }

  try {
    // Find the matching TH_Client by name (case-insensitive)
    const clients: { id: string }[] = await prisma.$queryRaw`
      SELECT id FROM tickethub.th_clients
      WHERE name ILIKE ${clientName.trim()}
      LIMIT 1
    `

    if (clients.length === 0) {
      return NextResponse.json(
        { error: `No TicketHub client found matching "${clientName}". Create the client in TicketHub first.` },
        { status: 404 },
      )
    }
    const thClientId = clients[0].id

    // Find the global contract for this client
    const contracts: { id: string }[] = await prisma.$queryRaw`
      SELECT id FROM tickethub.th_contracts
      WHERE "clientId" = ${thClientId} AND "isGlobal" = true
      LIMIT 1
    `
    const contractId = contracts[0]?.id ?? null

    // Find the TH_User matching the current session email
    const users: { id: string }[] = await prisma.$queryRaw`
      SELECT id FROM tickethub.th_users
      WHERE email ILIKE ${session!.user!.email!}
      LIMIT 1
    `
    if (users.length === 0) {
      return NextResponse.json(
        { error: "Your email is not registered in TicketHub. Log into TicketHub first." },
        { status: 403 },
      )
    }
    const createdById = users[0].id

    // Create the ticket
    const ticketPriority = priority ?? "MEDIUM"
    const ticketType = type ?? "INCIDENT"
    const cuid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

    await prisma.$executeRaw`
      INSERT INTO tickethub.th_tickets (id, "clientId", "contractId", title, description, priority, type, status, "createdById", "createdAt", "updatedAt")
      VALUES (${cuid}, ${thClientId}, ${contractId}, ${title.trim()}, ${description?.trim() ?? ""}, ${ticketPriority}::"tickethub"."TH_TicketPriority", ${ticketType}::"tickethub"."TH_TicketType", 'NEW'::"tickethub"."TH_TicketStatus", ${createdById}, NOW(), NOW())
    `

    // Create timeline event
    const eventCuid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}e`
    await prisma.$executeRaw`
      INSERT INTO tickethub.th_ticket_events (id, "ticketId", "userId", type, data, "createdAt")
      VALUES (${eventCuid}, ${cuid}, ${createdById}, 'CREATED', '{"source":"dochub-alert"}'::jsonb, NOW())
    `

    const tickethubUrl = process.env.NEXT_PUBLIC_TICKETHUB_URL || "https://tickethub.pcc2k.com"

    return NextResponse.json({
      ticketId: cuid,
      url: `${tickethubUrl}/tickets/${cuid}`,
    }, { status: 201 })
  } catch (e: any) {
    console.error("[alerts/create-ticket] cross-schema insert failed", e)
    return NextResponse.json({ error: e.message || "Failed to create ticket" }, { status: 500 })
  }
}
