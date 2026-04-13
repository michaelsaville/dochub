import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const app = await prisma.application.findUnique({
    where: { id },
    select: { name: true, vendor: true, totalSeats: true, clientId: true, client: { select: { name: true } } },
  })
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const seats = await prisma.appSeatAssignment.findMany({
    where: { applicationId: id },
    include: {
      clientUser: { select: { name: true, email: true, jobTitle: true } },
      contact: { select: { name: true, email: true, role: true } },
    },
    orderBy: { seatUsername: "asc" },
  })

  // Generate CSV
  const lines: string[] = []
  lines.push(`# ${app.name} User Map — ${app.client.name}`)
  lines.push(`# Generated: ${new Date().toISOString()}`)
  lines.push(`# Total Seats: ${app.totalSeats ?? "N/A"} | Assigned: ${seats.length}`)
  lines.push("")
  lines.push("Seat Username,Assigned To,Email,Role/Title,Notes")

  for (const s of seats) {
    const assignedTo = s.clientUser?.name || s.contact?.name || "Unassigned"
    const email = s.clientUser?.email || s.contact?.email || ""
    const role = s.clientUser?.jobTitle || s.contact?.role || ""
    const notes = (s.notes || "").replace(/,/g, ";").replace(/\n/g, " ")
    lines.push(`${s.seatUsername || ""},${assignedTo},${email},${role},${notes}`)
  }

  const csv = lines.join("\n")
  const filename = `${app.name.replace(/[^a-zA-Z0-9]/g, "_")}_User_Map.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
